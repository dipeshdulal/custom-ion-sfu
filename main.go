package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/pion/ion-sfu/pkg/sfu"
	"github.com/pion/webrtc/v3"
	"github.com/spf13/viper"
)

type WSMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

type IceCandidateData struct {
	Candidates webrtc.ICECandidateInit `json:"candidates"`
	Target     int                     `json:"target"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var conf sfu.Config

func load() bool {
	viper.SetConfigFile("config.toml")
	viper.SetConfigType("toml")

	err := viper.ReadInConfig()
	if err != nil {
		log.Println(err, "config file read failed")
		return false
	}
	err = viper.GetViper().Unmarshal(&conf)
	if err != nil {
		log.Println(err, "sfu config file loaded failed")
		return false
	}

	return true
}

func main() {

	load()

	conf.WebRTC.SDPSemantics = "unified-plan-with-fallback"

	s := sfu.NewSFU(conf)
	s.NewDatachannel(sfu.APIChannelLabel)

	http.HandleFunc("/ws", NewWebsocketHandler(s))
	log.Println("server listening in :7000")
	http.ListenAndServe(":7000", nil)
}

func NewWebsocketHandler(s *sfu.SFU) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		conn, err := upgrader.Upgrade(w, req, nil)

		if err != nil {
			log.Println(err)
			return
		}

		defer func() {
			if err := conn.Close(); err != nil {
				log.Println("there is conn error: ", err)
			}
		}()

		peer := sfu.NewPeer(s)
		peer.Join("room-id", uuid.NewString())

		peer.OnOffer = func(sdp *webrtc.SessionDescription) {
			if err := conn.WriteJSON(sdp); err != nil {
				log.Println(err)
			}
		}

		peer.OnIceCandidate = func(ii *webrtc.ICECandidateInit, i int) {
			if err := conn.WriteJSON(map[string]interface{}{
				"candidate": ii,
				"target":    i,
			}); err != nil {
				log.Println(err)
			}
		}

		for {
			wsMessage := WSMessage{}
			if err := conn.ReadJSON(&wsMessage); err != nil {
				log.Println("err: ", err.Error())
				return
			}

			switch wsMessage.Type {
			case "offer":
				answer, err := peer.Answer(webrtc.SessionDescription{
					Type: webrtc.SDPTypeOffer,
					SDP:  wsMessage.Data,
				})
				if err != nil {
					log.Println(err)
					break
				}
				if err := conn.WriteJSON(answer); err != nil {
					log.Println(err)
				}
			case "answer":
				err = peer.SetRemoteDescription(webrtc.SessionDescription{
					Type: webrtc.SDPTypeAnswer,
					SDP:  wsMessage.Data,
				})
				if err != nil {
					log.Println(err)
				}
			case "trickle":
				candidates := IceCandidateData{}
				_ = json.Unmarshal([]byte(wsMessage.Data), &candidates)
				err := peer.Trickle(candidates.Candidates, candidates.Target)
				if err != nil {
					log.Println(err)
				}
			}

		}
	}
}

// sfuInstance := sfu.NewSFU(sfu.Config{})

// localPeer := sfu.NewPeer(sfuInstance)
// when there is new offer on the peer
// localPeer.OnOffer

// when new ice candidates for found for the peer
// localPeer.OnIceCandidate

// join a user to a given session/room
// localPeer.Join("session-id", "user-id")

// generate answer for a offer
// localPeer.Answer(offer)

// if there is a answer
// localPeer.SetRemoteDescription(description)

// for adding ice candidates in publisher/subscriber instance
// localPeer.Trickle("candidate", --add ice in the publisher instance or subscriber instance--)

// ion-sfu contains two peer connections per session
// first will always be used to publish tracks from clients
// another will always be used to subscribe to remote peers
