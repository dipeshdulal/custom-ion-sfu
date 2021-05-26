package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/ivfwriter"
	"github.com/pion/webrtc/v3/pkg/media/oggwriter"
	"golang.org/x/net/context"
)

type IceCandidateData struct {
	Candidates webrtc.ICECandidateInit `json:"candidate"`
	Target     int                     `json:"target"`
}

type JSON map[string]interface{}

func (j JSON) String() string {
	ret, err := json.Marshal(j)
	if err != nil {
		return ""
	}
	return string(ret)
}

var addr = flag.String("addr", "localhost:7000", "http service address")

func saveToDisk(i media.Writer, track *webrtc.TrackRemote) {
	defer func() {
		if err := i.Close(); err != nil {
			log.Fatal(err)
		}
	}()

	for {
		rtpPacket, _, err := track.ReadRTP()
		if err != nil {
			log.Fatal(err)
		}

		if err := i.WriteRTP(rtpPacket); err != nil {
			log.Fatal(err)
		}
	}

}

func main() {

	flag.Parse()

	api := newWebRTCAPI()
	config := webrtc.Configuration{}
	peer, err := api.NewPeerConnection(config)
	if err != nil {
		log.Fatal(err)
	}

	if _, err := peer.CreateDataChannel("ion-sfu", nil); err != nil {
		log.Fatal(err)
	}

	if _, err := peer.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio); err != nil {
		log.Fatal(err)
	}

	if _, err := peer.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo); err != nil {
		log.Fatal(err)
	}

	oggFile, err := oggwriter.New("output.ogg", 48000, 2)
	if err != nil {
		log.Fatal(err)
	}

	ivfFile, err := ivfwriter.New("output.ivf")
	if err != nil {
		log.Fatal(err)
	}

	peer.OnTrack(func(tr *webrtc.TrackRemote, r *webrtc.RTPReceiver) {
		// Send a PLI on an interval so that the publisher is pushing a keyframe every rtcpPLIInterval
		go func() {
			ticker := time.NewTicker(time.Second * 3)
			for range ticker.C {
				errSend := peer.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(tr.SSRC())}})
				if errSend != nil {
					fmt.Println(errSend)
				}
			}
		}()

		codec := tr.Codec()
		if strings.EqualFold(codec.MimeType, webrtc.MimeTypeOpus) {
			fmt.Println("Got Opus track, saving to disk as output.opus (48 kHz, 2 channels)")
			saveToDisk(oggFile, tr)
		} else if strings.EqualFold(codec.MimeType, webrtc.MimeTypeVP8) {
			fmt.Println("Got VP8 track, saving to disk as output.ivf")
			saveToDisk(ivfFile, tr)
		}
	})

	peer.OnConnectionStateChange(func(pcs webrtc.PeerConnectionState) {
		log.Println("connectionState: ", pcs.String())
	})

	peer.OnICEConnectionStateChange(func(is webrtc.ICEConnectionState) {
		if is == webrtc.ICEConnectionStateConnected {
			log.Println("webrtc connection established")
		}
		if is == webrtc.ICEConnectionStateFailed || is == webrtc.ICEConnectionStateDisconnected {
			if err := oggFile.Close(); err != nil {
				log.Fatal(err)
			}
			if err := ivfFile.Close(); err != nil {
				log.Fatal(err)
			}

			log.Println("done writing media files")
			os.Exit(0)
		}
	})

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	u := url.URL{Scheme: "ws", Host: *addr, Path: "/ws"}
	log.Printf("connecting to %s", u.String())

	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatal("dail: ", err)
	}
	defer c.Close()

	peer.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i == nil {
			return
		}
		log.Println("local ice candidate gathering")

		err := c.WriteJSON(map[string]interface{}{
			"type": "trickle",
			"data": JSON{
				"target":    1,
				"candidate": i.ToJSON().Candidate,
			}.String(),
		})
		if err != nil {
			log.Println("error sending ice candidate")
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	go websocketListener(cancel, c, peer)

	for {
		select {
		case <-ctx.Done():
			log.Println("websocket connection closed from server")
			return
		case <-interrupt:
			log.Println("interrupt received, closing websocket connection")
			err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			if err != nil {
				log.Println("write close: ", err)
				return
			}
			select {
			case <-ctx.Done():
			case <-time.After(time.Second):
			}
			return
		}
	}
}

func websocketListener(cancel context.CancelFunc, c *websocket.Conn, peer *webrtc.PeerConnection) {
	defer cancel()
	for {
		_, message, err := c.ReadMessage()
		if err != nil {
			log.Println("read: ", err)
			return
		}

		candidateData := IceCandidateData{}
		if err := json.Unmarshal(message, &candidateData); err != nil {
			log.Println("unmarshal error...")
		}

		if candidateData.Candidates.Candidate != "" && candidateData.Target == 1 {
			log.Println("adding ice candidates")
			if err := peer.AddICECandidate(candidateData.Candidates); err != nil {
				log.Println("error adding ice candidates", err)
			}
			continue
		}

		sdp := webrtc.SessionDescription{}
		if err := json.Unmarshal(message, &sdp); err != nil {
			log.Println("sdp...")
		}

		if sdp.Type == webrtc.SDPTypeOffer {
			if err := peer.SetRemoteDescription(sdp); err != nil {
				log.Println("error setting remote description.")
			}

			log.Println("set local description")
			answer, err := peer.CreateAnswer(nil)
			if err != nil {
				log.Println("error creating answer.", err)
			}

			if err := peer.SetLocalDescription(answer); err != nil {
				log.Println("err: ", err)
			}

			log.Println("ice gathering is complete")
			if err := c.WriteJSON(map[string]interface{}{
				"type": "answer",
				"data": peer.LocalDescription().SDP,
			}); err != nil {
				log.Println("cannot write json")
			}
		}
	}
}

func newWebRTCAPI() *webrtc.API {
	m := &webrtc.MediaEngine{}

	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8, ClockRate: 90000, Channels: 0, SDPFmtpLine: "", RTCPFeedback: nil},
		PayloadType:        96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		log.Fatal(err)
	}

	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 0, SDPFmtpLine: "", RTCPFeedback: nil},
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		log.Fatal(err)
	}

	i := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(m, i); err != nil {
		log.Fatal(err)
	}

	return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithInterceptorRegistry(i))
}
