import Peer from "peerjs";

// We use PeerJS's free public broker only for the initial handshake (finding
// the other device). No files ever pass through it — once two devices are
// introduced, data streams directly between them over WebRTC.

// All our peer IDs share this prefix so we don't collide with other apps that
// also use the public broker. The host's ID is simply prefix + room code.
const PEER_PREFIX = "zenithtransfer-";

// ICE servers help two devices find a path to each other across networks.
// STUN (below) is free and covers most cases. If you later need to reach the
// hardest/strictest networks, add a TURN entry here (see plan step 10).
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function hostPeerId(code) {
  return PEER_PREFIX + code;
}

// Create the "host" peer (the computer): it claims the room code as its ID and
// waits for the other device to connect.
export function createHostPeer(code) {
  return new Peer(hostPeerId(code), { config: ICE_CONFIG });
}

// Create the "joiner" peer (the phone): it gets a random ID and reaches out to
// the host.
export function createJoinerPeer() {
  return new Peer({ config: ICE_CONFIG });
}
