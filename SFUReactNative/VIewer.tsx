import React, { useEffect, useRef, useState } from 'react';
import {
    Button,
    StyleSheet,
    View,
} from 'react-native';

import { MediaStream, RTCPeerConnection, RTCSessionDescriptionType, RTCView } from "react-native-webrtc";

export const Viewer = () => {

    const [remoteStream, setRemoteStream] = useState<MediaStream>();

    const peerConnection = useRef<RTCPeerConnection>()

    const startStreaming = async (remoteDescription: RTCSessionDescriptionType) => {

        peerConnection.current = new RTCPeerConnection({
            iceServers: []
        })

        peerConnection.current.onaddstream = (event) => {
            console.log("on add stream")
            setRemoteStream(event.stream)
        }

        peerConnection.current.onremovestream = () => console.log("stream removed")

        peerConnection.current.onconnectionstatechange = (event) => console.log("state change connection: ", peerConnection.current?.connectionState)

        peerConnection.current.onsignalingstatechange = () => console.log(peerConnection.current?.signalingState)

        peerConnection.current.onicecandidateerror = console.log

        peerConnection.current.onicecandidate = (event) => {
            const candidate = event.candidate;
        }
        
        await peerConnection.current?.setRemoteDescription(remoteDescription)

        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        
    }

    return (
        <View style={StyleSheet.absoluteFill}>
            <View style={{ flexDirection: "row", justifyContent: "space-evenly" }}>
                <Button title="Play" onPress={() => {}} />
                <Button title="Stop" onPress={() => {}} />
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