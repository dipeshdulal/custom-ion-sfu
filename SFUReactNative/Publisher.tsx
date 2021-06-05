import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dimensions,
  StyleSheet,
  View,
} from 'react-native';

import { mediaDevices, MediaStream, RTCPeerConnection, RTCView, setCameraMuted } from "react-native-webrtc";

export const Publisher = () => {

  const [started, setStarted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [audiMuted, setAudioMuted] = useState(false)
  const [videoMuted, setVideoMuted] = useState(false)

  const [localStream, setLocalStream] = useState<MediaStream>();

  const localStreamRef = useRef<MediaStream>();

  const peerConnection = useRef<RTCPeerConnection>()
  const socketRef = useRef<WebSocket>();

  const startStreaming = async () => {

    if (!localStreamRef?.current) {
      return;
    }

    socketRef.current = new WebSocket("ws://ec2-18-181-195-202.ap-northeast-1.compute.amazonaws.com:7000/ws")
    socketRef.current.onmessage = async (e) => {
      const response = JSON.parse(e.data)
      if (response.type === "answer") {
        console.log("got answer:", response)
        await peerConnection.current?.setRemoteDescription(response)
        console.log("set-remote-description")
      }

      if (response.candidate && response.target === 0) {
        await peerConnection.current?.addIceCandidate(response.candidate);
        console.log("add-ice-candidate");
      }
    }

    peerConnection.current = new RTCPeerConnection({
      iceServers: [],
      sdpSemantics: "unified-plan",
    })
    peerConnection.current.createDataChannel("ion-sfu")
    for (const track of localStreamRef.current.getTracks()) {
      peerConnection.current.addTransceiver(track, {
        direction: "sendrecv",
        streams: [localStreamRef.current]
      })
    }
    // peerConnection.current?.addTransceiver(localStreamRef.current, {direction: "sendrecv", streams: [localStreamRef.current.]});
    peerConnection.current.onsignalingstatechange = () => console.log("[publisher] signalingState: ", peerConnection.current?.signalingState)
    peerConnection.current.onconnectionstatechange = () => {
      console.log("[publisher] connectionState: ", peerConnection.current?.connectionState)
    }
    peerConnection.current.onicecandidateerror = console.log
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current?.send(JSON.stringify({
          type: "trickle",
          data: JSON.stringify({
            "target": 0,
            "candidates": event.candidate
          })
        }))
      }
    }

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    setTimeout(() => {
      socketRef.current?.send(JSON.stringify({
        "type": "offer",
        "data": peerConnection.current?.localDescription.sdp
      }))
    }, 1000)

  }

  useEffect(() => {
    const getStream = async () => {
      let sourceId;
      const sourceInfos = await mediaDevices.enumerateDevices()
      for (const info of sourceInfos) {
        if (info.kind == "videoinput" && info.facing == isFrontCamera ? "user" : "environment") {
          sourceId = info.deviceId;
        }
      }

      const media = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: isFrontCamera ? "user" : "environment",
          mandatory: {
            minFrameRate: 30,
            minHeight: Dimensions.get("window").height,
            minWidth: Dimensions.get("window").width,
          },
          optional: sourceId
        }
      })

      if (media) {
        localStreamRef.current = media as MediaStream;
        setLocalStream(media as MediaStream)
      }
    }

    getStream();
  }, [])

  return (
    <View style={StyleSheet.absoluteFill}>
      {!!localStream &&
        <RTCView streamURL={localStream?.toURL()} style={{ flex: 1 }} mirror={isFrontCamera} objectFit="cover" />
      }
      <View style={styles.bottom}>
        <Button title={started ? "Stop" : "Start"} color="white" onPress={async () => {
          if (!started) {
            setStarted(true);
            await startStreaming();
            return;
          }

          setStarted(false);
          peerConnection.current?.close();

        }} />
        <Button title={audiMuted ? "UMA" : "MA"} color="white" onPress={() => {
          localStreamRef.current.getAudioTracks().forEach(each => {
            each.enabled = audiMuted;
          })
          setAudioMuted(m => !m);
        }} />
        <Button title={videoMuted ? "UMV" : "MV"} color="white" onPress={() => {
          setCameraMuted(!videoMuted)
          setTimeout(() => {
            localStreamRef.current.getVideoTracks().forEach(each => {
              each.enabled = videoMuted;
            })
          }, 100)
          setVideoMuted(m => !m);
        }} />
        <Button title="SC" color="white" onPress={() => {
          localStreamRef.current.getVideoTracks().forEach(each => {
            // @ts-ignore
            // easiest way is to switch camera this way
            each._switchCamera();
          })
          setIsFrontCamera(c => !c);
        }} />
      </View>
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