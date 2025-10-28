import { useState, useRef } from 'react'

function App() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const peerConnectionRef = useRef(null)
  const streamRef = useRef(null)
  const audioElementRef = useRef(null)

  const handleTalkToggle = async () => {
    if (isListening) {
      // Stop recording
      stopRecording()
    } else {
      // Start recording
      await startRecording()
    }
  }

  const startRecording = async () => {
    try {
      setError(null)
      // 1. Get user microphone permission
      console.log('Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      streamRef.current = stream
      console.log('Microphone access granted')

      // 2. Create WebRTC peer connection
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
      const peerConnection = new RTCPeerConnection(configuration)
      peerConnectionRef.current = peerConnection

      // 3. Add audio tracks to the connection
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
        console.log('Added audio track to peer connection')
      })

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('New ICE candidate:', event.candidate)
        } else {
          console.log('All ICE candidates have been sent')
        }
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState)
      }

      // Handle incoming audio track from OpenAI
      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind)

        if (event.track.kind === 'audio') {
          const remoteStream = event.streams[0]

          // Create or get audio element
          if (!audioElementRef.current) {
            audioElementRef.current = new Audio()
            audioElementRef.current.autoplay = true
          }

          // Set the remote stream as the source
          audioElementRef.current.srcObject = remoteStream

          // Play the audio
          audioElementRef.current.play()
            .then(() => {
              console.log('Playing audio from OpenAI')
            })
            .catch((err) => {
              console.error('Error playing audio:', err)
            })
        }
      }

      // 4. Create SDP offer
      console.log('Creating SDP offer...')
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })

      // Set local description
      await peerConnection.setLocalDescription(offer)
      console.log('Local description set:', offer)

      // Wait for ICE gathering to complete
      await waitForICEGathering(peerConnection)

      // 5. Send SDP offer to backend
      console.log('Sending SDP offer to backend...')
      const response = await fetch('http://localhost:3000/initiate-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: peerConnection.localDescription.sdp,
          type: peerConnection.localDescription.type,
        }),
      })

      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`)
      }

      const data = await response.json()
      console.log('Received answer from backend:', data)

      // Set remote description with the answer from backend
      if (data.sdp && data.type) {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription({
            sdp: data.sdp,
            type: data.type,
          })
        )
        console.log('Remote description set successfully')
      }

      setIsListening(true)
      console.log('Recording started successfully')

    } catch (err) {
      console.error('Error starting recording:', err)
      setError(err.message)
      stopRecording()
    }
  }

  const waitForICEGathering = (peerConnection) => {
    return new Promise((resolve) => {
      if (peerConnection.iceGatheringState === 'complete') {
        resolve()
      } else {
        const checkState = () => {
          if (peerConnection.iceGatheringState === 'complete') {
            peerConnection.removeEventListener('icegatheringstatechange', checkState)
            resolve()
          }
        }
        peerConnection.addEventListener('icegatheringstatechange', checkState)
      }
    })
  }

  const stopRecording = () => {
    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log('Stopped media track')
      })
      streamRef.current = null
    }

    // Stop and cleanup audio element
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.srcObject = null
      audioElementRef.current = null
      console.log('Stopped audio playback')
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      console.log('Closed peer connection')
      peerConnectionRef.current = null
    }

    setIsListening(false)
    console.log('Recording stopped')
  }

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl w-full mx-auto text-center">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            AI Tutor Assistant
          </h1>
          <p className="text-lg text-gray-600">
            {!isListening ? "Click the microphone to start talking" : "Listening..."}
          </p>
          {error && (
            <p className="text-red-500 text-sm mt-2">
              Error: {error}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-8">
          {/* Amplifier Bars - Always visible, animate only when listening */}
          <div className="h-24 flex items-center justify-center">
            <div className="flex items-center justify-center gap-1">
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0s]' : ''}`} style={{ height: '20px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.1s]' : ''}`} style={{ height: '30px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.2s]' : ''}`} style={{ height: '40px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.15s]' : ''}`} style={{ height: '50px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.3s]' : ''}`} style={{ height: '60px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.25s]' : ''}`} style={{ height: '70px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.35s]' : ''}`} style={{ height: '80px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.4s]' : ''}`} style={{ height: '70px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.3s]' : ''}`} style={{ height: '60px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.45s]' : ''}`} style={{ height: '50px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.2s]' : ''}`} style={{ height: '40px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.5s]' : ''}`} style={{ height: '30px' }}></div>
              <div className={`w-1 bg-blue-500 rounded-full ${isListening ? 'animate-[wave-bar_0.6s_ease-in-out_infinite] [animation-delay:0.1s]' : ''}`} style={{ height: '20px' }}></div>
            </div>
          </div>

          {/* Talk Button */}
          <button
            onClick={handleTalkToggle}
            className={`
              w-24 h-24 md:w-28 md:h-28 rounded-full
              flex items-center justify-center transition-all duration-300
              ${isListening
                ? 'bg-blue-500 shadow-lg shadow-blue-200 scale-110'
                : 'bg-blue-500 hover:bg-blue-600 hover:scale-105 shadow-md'
              }
              cursor-pointer active:scale-95
            `}
          >
            <svg
              className="w-10 h-10 md:w-12 md:h-12 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {!isListening ? (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              ) : (
                <rect x="6" y="6" width="12" height="12" rx="2" />
              )}
            </svg>
          </button>

          {/* Instructions */}
          <div className="text-gray-500 text-sm">
            <p>Click to {isListening ? 'stop' : 'start'} recording</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
