import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dimensions,
  StyleSheet,
  View,
} from 'react-native';

import { mediaDevices, MediaStream, RTCPeerConnection, RTCView } from "react-native-webrtc";

export const Publisher = () => {

  const [started, setStarted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [audiMuted, setAudioMuted] = useState(false)
  const [videoMuted, setVideoMuted] = useState(false)

  const [localStream, setLocalStream] = useState<MediaStream>();

  const localStreamRef = useRef<MediaStream>();

  const peerConnection = useRef<RTCPeerConnection>()

  const startStreaming = async () => {

    if (!localStreamRef?.current) {
      return;
    }

    peerConnection.current = new RTCPeerConnection({
      iceServers: []
    })

    peerConnection.current?.addStream(localStreamRef.current);

    peerConnection.current.onsignalingstatechange = () => console.log(peerConnection.current?.signalingState)

    peerConnection.current.onicecandidateerror = console.log
    peerConnection.current.onicecandidate = (event) => {
      
    }

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

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
        <Button title={audiMuted? "UMA": "MA"} color="white" onPress={() => {
          const localStreams = peerConnection.current?.getLocalStreams() || [];
          for(const stream of localStreams){
            stream.getAudioTracks().forEach(each => {
              each.enabled = audiMuted;
            })
          }
          setAudioMuted(m => !m);
        }} />
        <Button title={videoMuted? "UMV": "MV"} color="white" onPress={() => {
          const localStreams = peerConnection.current?.getLocalStreams() || [];
          for(const stream of localStreams){
            stream.getVideoTracks().forEach(each => {
              each.enabled = videoMuted;
            })
          }
          setVideoMuted(m => !m);
        }} />
        <Button title="SC" color="white" onPress={() => {
          const localStreams = peerConnection.current?.getLocalStreams() || [];
          for(const stream of localStreams){
            stream.getVideoTracks().forEach(each => {
              // @ts-ignore
              // easiest way is to switch camera this way
              each._switchCamera();
            })
          }
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