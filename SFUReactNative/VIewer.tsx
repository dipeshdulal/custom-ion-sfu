import React, { useEffect, useRef, useState } from 'react';
import {
    Button,
    StyleSheet,
    View,
} from 'react-native';

import { MediaStream, RTCPeerConnection, RTCSessionDescriptionType, RTCView } from "react-native-webrtc";

export const Viewer = () => {

    const [remoteStream, setRemoteStream] = useState<MediaStream>();

    const websocket = useRef<WebSocket>();

    const peerConnection = useRef<RTCPeerConnection>()

    const startStreaming = async () => {

        peerConnection.current = new RTCPeerConnection({
            iceServers: []
        })

        websocket.current = new WebSocket("ws://192.168.0.183:7000/ws")
        websocket.current.onopen = () => console.log("connection opened")
        websocket.current.onmessage = async (e) => {
            const response = JSON.parse(e.data)
            if (response.type === "offer") {
                await peerConnection.current?.setRemoteDescription(response)
                const answer = await peerConnection.current?.createAnswer();
                if (answer) {
                    await peerConnection.current?.setLocalDescription(answer);
                    await websocket.current?.send(JSON.stringify({
                        "type": "answer",
                        "data": answer.sdp,
                    }))
                }
                console.log("set-remote-description")
            }

            if (response.candidate && response.target === 1) {
                peerConnection.current?.addIceCandidate(response.candidate);
                console.log("add-ice-candidate");
            }
        }


        peerConnection.current.onaddstream = (event) => {
            console.log("on add stream")
            setRemoteStream(event.stream)
        }

        peerConnection.current.onremovestream = () => console.log("stream removed")

        peerConnection.current.onconnectionstatechange = (event) => {
            console.log("state change connection: ", peerConnection.current?.connectionState)
            const remoteStreams = peerConnection.current?.getRemoteStreams()
            console.log(remoteStreams)
        }

        peerConnection.current.onsignalingstatechange = () => console.log(peerConnection.current?.signalingState)

        peerConnection.current.onicecandidateerror = console.log

        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                websocket.current?.send(JSON.stringify({
                    type: "trickle",
                    data: JSON.stringify({
                        "target": 1,
                        "candidates": event.candidate
                    })
                }))
            }
        }

    }

    return (
        <View style={StyleSheet.absoluteFill}>
            <View style={{ flexDirection: "row", justifyContent: "space-evenly" }}>
                <Button title="Play" onPress={() => {
                    console.log("start the streaming")
                    startStreaming();
                 }} />
                <Button title="Stop" onPress=   {() => { }} />
            </View>
            {!!remoteStream &&
                <RTCView streamURL={remoteStream?.toURL()} style={{ flex: 1 }} objectFit="cover" />
            }
        </View>
    );
};

const styles = StyleSheet.create({
    bottom: {
        position: "absolute",
        bottom: 0,
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        justifyContent: "space-evenly",
        marginBottom: 30
    }
})