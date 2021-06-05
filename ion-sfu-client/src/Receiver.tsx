import React, { useEffect, useRef, useState } from 'react'

export const Receiver = () => {

    const websocket = useRef<WebSocket>();
    const pcSend = useRef<RTCPeerConnection>();
    const recvVideoRef = useRef<HTMLVideoElement>(null);

    const [streams, setStreams] = useState<MediaStream[]>([]);

    const [connectionState, setConnectionState] = useState<string>();

    const handleStartPublishing = async () => {
        websocket.current = new WebSocket("ws://ec2-18-181-195-202.ap-northeast-1.compute.amazonaws.com:7000/ws");
        pcSend.current = new RTCPeerConnection({
            iceServers: [
                { urls: ["stun:stun.l.google.com:19302"] }
            ]
        });

        websocket.current.onopen = () => console.log("connection opened")
        websocket.current.onmessage = async (e) => {
            const response = JSON.parse(e.data)
            if (response.type === "offer") {
                await pcSend.current?.setRemoteDescription(response)
                const answer = await pcSend.current?.createAnswer();
                if (answer) {
                    await pcSend.current?.setLocalDescription(answer);
                    await websocket.current?.send(JSON.stringify({
                        "type": "answer",
                        "data": answer.sdp,
                    }))
                }
                console.log("set-remote-description")
            }

            if (response.candidate && response.target === 1) {
                pcSend.current?.addIceCandidate(response.candidate);
                console.log("add-ice-candidate");
            }
        }


        pcSend.current.onconnectionstatechange = () => {
            console.log("state: ", pcSend.current?.connectionState)
            setConnectionState(pcSend.current?.connectionState);
        }

        pcSend.current.ontrack = (e) => {
            console.log("streams: ", e.streams);
            setStreams((s) => {
                if(e.streams.length==1 && e.streams[0].active) {
                    s.push(e.streams[0])
                }
                return s;
            })
        }

        pcSend.current.onicecandidate = (event) => {
            if (event.candidate) {
                websocket.current?.send(JSON.stringify({
                    type: "tricle",
                    data: JSON.stringify({
                        "target": 1,
                        "candidates": event.candidate
                    })
                }))
            }
        }

    }

    console.log("Streams: ", streams)

    return (
        <div>
            <button onClick={handleStartPublishing}>StartViewing</button> <br />
            {
                streams.map((stream) => (
                    <div key={stream.id}>
                        <Video srcObject={stream} />
                    </div>
                ))
            }
            <pre>ConnectionState: {connectionState}</pre>
        </div>

    )
}

const Video: React.FC<any> = ({ srcObject }) => {

    const recvVideoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (srcObject && recvVideoRef.current) {
            recvVideoRef.current.srcObject = srcObject;
        }
    }, [srcObject])

    if(srcObject.active) {
        return <video autoPlay ref={recvVideoRef} style={{ width: 200, height: 200, background: "#333" }}></video>
    }

    return null;
}