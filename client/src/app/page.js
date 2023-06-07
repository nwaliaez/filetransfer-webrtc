'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
// import streamSaver from 'streamsaver';

export default function Home() {
    const [connection, setConnection] = useState(false);
    const [file, setFile] = useState();
    const [gotFile, setGotFile] = useState(false);
    const fileNameRef = useRef();
    const workerRef = useRef();

    const socketRef = useRef();
    const peerRef = useRef();
    const roomID = 'test';

    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../utils/worker.js', import.meta.url)
        );
        socketRef.current = io.connect('http://localhost:8000');
        socketRef.current.emit('join room', roomID);
        socketRef.current.on('user conencted', (userId) => {
            peerRef.current = createPeer(userId, socketRef.current.id);
        });

        socketRef.current.on('user joined', (payload) => {
            peerRef.current = addPeer(payload.signal, payload.callerID);
        });

        socketRef.current.on('receiving returned signal', (payload) => {
            console.log('Peer1 Return signal added', payload.signal);
            peerRef.current.signal(payload.signal);
            setConnection(true);
        });
    }, []);

    function createPeer(target, callerID) {
        console.log('Peer1 Created');
        const peer = new Peer({
            initiator: true,
            trickle: false,
        });

        peer.on('signal', (signal) => {
            socketRef.current.emit('sending signal', {
                target,
                callerID,
                signal,
            });
        });

        peer.on('data', handleReceivingData);

        return peer;
    }

    function addPeer(incomingSignal, callerID) {
        console.log('Peer2 Added');

        const peer = new Peer({
            initiator: false,
            trickle: false,
        });

        peer.on('signal', (signal) => {
            socketRef.current.emit('returning signal', {
                signal,
                target: callerID,
            });
        });

        peer.on('data', handleReceivingData);

        console.log('Peer2 Signal Added', incomingSignal);
        peer.signal(incomingSignal);
        setConnection(true);
        return peer;
    }

    function handleReceivingData(data) {
        console.log('Data incoming');
        const worker = workerRef.current;

        if (data.toString().includes('done')) {
            console.log('Data received');
            setGotFile(true);
            const parsed = JSON.parse(data);
            fileNameRef.current = parsed.fileName;
        } else {
            worker.postMessage(data);
        }
    }

    const download = () => {
        setGotFile(false);
        const worker = workerRef.current;
        worker.postMessage('download');
        worker.addEventListener('message', (event) => {
            const link = document.createElement('a');
            link.href = event.data;
            link.download = fileNameRef.current;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(event.data);
        });
    };
    const selectFile = (e) => {
        setFile(e.target.files[0]);
    };

    const sendFile = () => {
        const CHUNK_SIZE = 16384;
        const peer = peerRef.current;
        // const stream = file.stream();
        // const reader = stream.getReader();
        handleReading();
        // reader.read().then((obj) => {
        //     console.log('Obj', obj);
        //     handleReading(obj.done, obj.value);
        // });
        function handleReading() {
            const fileReader = new FileReader();
            let offset = 0;

            fileReader.addEventListener('load', (event) => {
                if (
                    event &&
                    event.target &&
                    event.target.result &&
                    event.target.result instanceof ArrayBuffer
                ) {
                    const arrayBuffer = event.target.result;
                    const chunkBuffer = Buffer.from(arrayBuffer);
                    peer.write(chunkBuffer);

                    offset += event.target.result.byteLength;

                    if (offset < file.size) {
                        readSliceBlob(offset);
                    } else {
                        console.log('Data sent');
                        peer.write(
                            JSON.stringify({ done: true, fileName: file.name })
                        );
                    }
                }
            });
            readSliceBlob(0);

            function readSliceBlob(offset) {
                const slicedBlob = file.slice(offset, offset + CHUNK_SIZE);
                fileReader.readAsArrayBuffer(slicedBlob);
            }
        }
    };

    return (
        <main>
            {connection && (
                <div>
                    <input onChange={selectFile} type="file" />
                    <button onClick={sendFile}>Send File</button>
                </div>
            )}
            {gotFile && (
                <>
                    {fileNameRef.current}
                    <button onClick={download}>Download</button>
                </>
            )}
        </main>
    );
}
