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


function assignSides(room) {
	if (room.selected_side === "tiger") {
		room.host_side = "tiger";
		room.guest_side = "goat";
		return;
	}

	if (room.selected_side === "goat") {
		room.host_side = "goat";
		room.guest_side = "tiger";
		return;
	}

	const hostGetsTigers = Math.random() < 0.5;

	room.host_side = hostGetsTigers ? "tiger" : "goat";
	room.guest_side = hostGetsTigers ? "goat" : "tiger";
}


wss.on("connection", (socket) => {
	console.log("Client connected");

	socket.on("message", (raw) => {
		let message;

		try {
			message = JSON.parse(raw.toString());
		}
		catch {
			send(socket, {
				type: "error",
				message: "Invalid message"
			});

			return;
		}


		// ====================================================
		// CREATE ROOM
		// ====================================================

		if (message.type === "create_room") {
			let roomCode = generateRoomCode();

			while (rooms.has(roomCode)) {
				roomCode = generateRoomCode();
			}

			const selectedSide = [
				"tiger",
				"goat",
				"random"
			].includes(message.selected_side)
				? message.selected_side
				: "random";

			rooms.set(roomCode, {
				host: socket,
				guest: null,

				theme_id: message.theme_id ?? "basic",
				selected_side: selectedSide,

				host_side: "",
				guest_side: ""
			});

			socket.roomCode = roomCode;
			socket.roomRole = "host";

			send(socket, {
				type: "room_created",
				code: roomCode
			});

			console.log(
				`Room created: ${roomCode}, selected side: ${selectedSide}`
			);

			return;
		}


		// ====================================================
		// JOIN ROOM
		// ====================================================

		if (message.type === "join_room") {
			const roomCode = String(
				message.code ?? ""
			)
				.trim()
				.toUpperCase();

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
			socket.roomRole = "guest";

			assignSides(room);

			send(room.host, {
				type: "room_ready",

				code: roomCode,

				your_side: room.host_side,
				opponent_side: room.guest_side,

				theme_id: room.theme_id
			});

			send(room.guest, {
				type: "room_ready",

				code: roomCode,

				your_side: room.guest_side,
				opponent_side: room.host_side,

				theme_id: room.theme_id
			});

			send(room.host, {
				type: "player_joined",
				code: roomCode
			});

			console.log(
				`Room ready: ${roomCode} | ` +
				`host=${room.host_side} | ` +
				`guest=${room.guest_side}`
			);

			return;
		}


		// ====================================================
		// LEAVE ROOM
		// ====================================================

		if (message.type === "leave_room") {
			const roomCode = socket.roomCode;

			if (!roomCode) {
				return;
			}

			const room = rooms.get(roomCode);

			if (!room) {
				return;
			}

			if (socket.roomRole === "host") {
				if (room.guest) {
					send(room.guest, {
						type: "room_closed"
					});
				}

				rooms.delete(roomCode);

				socket.roomCode = null;
				socket.roomRole = null;

				console.log(`Room closed: ${roomCode}`);

				return;
			}

			if (socket.roomRole === "guest") {
				room.guest = null;

				room.host_side = "";
				room.guest_side = "";

				send(room.host, {
					type: "player_left"
				});

				socket.roomCode = null;
				socket.roomRole = null;

				console.log(`Guest left room: ${roomCode}`);

				return;
			}
		}


		// ====================================================
		// GAME MOVE
		// ====================================================

		if (message.type === "move") {
			const roomCode = socket.roomCode;

			if (!roomCode) {
				send(socket, {
					type: "error",
					message: "You are not in a room"
				});
				return;
			}

			const room = rooms.get(roomCode);

			if (!room) {
				send(socket, {
					type: "error",
					message: "Room not found"
				});
				return;
			}

			const opponent =
				socket.roomRole === "host"
					? room.guest
					: room.host;

			if (!opponent) {
				send(socket, {
					type: "error",
					message: "Opponent is not connected"
				});
				return;
			}

			send(opponent, {
				type: "move",
				move: message.move
			});

			return;
		}

		// ====================================================
		// UNKNOWN MESSAGE
		// ====================================================

		send(socket, {
			type: "error",
			message: "Unknown message type"
		});
	});


	// ========================================================
	// DISCONNECT
	// ========================================================

	socket.on("close", () => {
		console.log("Client disconnected");

		const roomCode = socket.roomCode;

		if (!roomCode) {
			return;
		}

		const room = rooms.get(roomCode);

		if (!room) {
			return;
		}

		if (socket.roomRole === "host") {
			if (room.guest) {
				send(room.guest, {
					type: "room_closed"
				});
			}

			rooms.delete(roomCode);

			console.log(
				`Host disconnected. Room removed: ${roomCode}`
			);

			return;
		}

		if (socket.roomRole === "guest") {
			room.guest = null;

			room.host_side = "";
			room.guest_side = "";

			send(room.host, {
				type: "player_left"
			});

			console.log(
				`Guest disconnected from room: ${roomCode}`
			);
		}
	});
});


server.listen(
	PORT,
	"0.0.0.0",
	() => {
		console.log(`Server running on port ${PORT}`);
	}
);