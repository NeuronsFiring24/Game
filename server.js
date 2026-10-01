import http from "http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("Cosmic Tiger server online");
});

const wss = new WebSocketServer({ server });

function send(socket, data) {
	if (socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(data));
	}
}

function generateRoomCode() {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
	const numbers = "23456789";

	let code = "";

	for (let i = 0; i < 4; i++) {
		code += letters[Math.floor(Math.random() * letters.length)];
	}

	code += "-";

	for (let i = 0; i < 4; i++) {
		code += numbers[Math.floor(Math.random() * numbers.length)];
	}

	return code;
}

wss.on("connection", (socket) => {
	socket.on("message", (raw) => {
		let message;

		try {
			message = JSON.parse(raw.toString());
		} catch {
			send(socket, {
				type: "error",
				message: "Invalid message"
			});
			return;
		}

		if (message.type === "create_room") {
			let roomCode = generateRoomCode();

			while (rooms.has(roomCode)) {
				roomCode = generateRoomCode();
			}

			rooms.set(roomCode, {
				host: socket,
				guest: null,
				theme_id: message.theme_id ?? "basic"
			});

			socket.roomCode = roomCode;
			socket.role = "host";

			send(socket, {
				type: "room_created",
				code: roomCode
			});

			return;
		}

		if (message.type === "join_room") {
			const roomCode = String(message.code ?? "").toUpperCase();
			const room = rooms.get(roomCode);

			if (!room) {
				send(socket, {
					type: "join_failed",
					message: "Room not found"
				});
				return;
			}

			if (room.guest) {
				send(socket, {
					type: "join_failed",
					message: "Room is full"
				});
				return;
			}

			room.guest = socket;

			socket.roomCode = roomCode;
			socket.role = "guest";

			send(socket, {
				type: "room_joined",
				code: roomCode,
				theme_id: room.theme_id
			});

			send(room.host, {
				type: "player_joined",
				code: roomCode
			});

			return;
		}
	});

	socket.on("close", () => {
		const roomCode = socket.roomCode;

		if (!roomCode) {
			return;
		}

		const room = rooms.get(roomCode);

		if (!room) {
			return;
		}

		if (socket.role === "host") {
			if (room.guest) {
				send(room.guest, {
					type: "room_closed"
				});
			}

			rooms.delete(roomCode);
			return;
		}

		if (socket.role === "guest") {
			room.guest = null;

			send(room.host, {
				type: "player_left"
			});
		}
	});
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`Server running on port ${PORT}`);
});