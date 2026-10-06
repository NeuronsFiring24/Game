import http from "http";
import {
	WebSocketServer,
	WebSocket
} from "ws";


const PORT =
	process.env.PORT || 3000;


const rooms =
	new Map();


// ============================================================
// HTTP SERVER
// ============================================================

const server =
	http.createServer(
		(req, res) => {

			res.writeHead(
				200,
				{
					"Content-Type":
						"text/plain"
				}
			);

			res.end(
				"Cosmic Tiger server online"
			);
		}
	);


// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss =
	new WebSocketServer({
		server
	});


// ============================================================
// HELPERS
// ============================================================

function send(
	socket,
	data
) {
	if (!socket) {
		return;
	}

	if (
		socket.readyState ===
		WebSocket.OPEN
	) {
		socket.send(
			JSON.stringify(
				data
			)
		);
	}
}


// ------------------------------------------------------------
// ROOM CODE
// ------------------------------------------------------------

function generateRoomCode() {

	const letters =
		"ABCDEFGHJKLMNPQRSTUVWXYZ";

	const numbers =
		"23456789";

	let code = "";


	for (
		let i = 0;
		i < 4;
		i++
	) {
		code +=
			letters[
				Math.floor(
					Math.random()
					* letters.length
				)
			];
	}


	code += "-";


	for (
		let i = 0;
		i < 4;
		i++
	) {
		code +=
			numbers[
				Math.floor(
					Math.random()
					* numbers.length
				)
			];
	}


	return code;
}


// ------------------------------------------------------------
// ASSIGN SIDES
// ------------------------------------------------------------

function assignSides(room) {

	if (
		room.selected_side ===
		"tiger"
	) {

		room.host_side =
			"tiger";

		room.guest_side =
			"goat";

		return;
	}


	if (
		room.selected_side ===
		"goat"
	) {

		room.host_side =
			"goat";

		room.guest_side =
			"tiger";

		return;
	}


	const hostGetsTigers =
		Math.random() < 0.5;


	room.host_side =
		hostGetsTigers
			? "tiger"
			: "goat";


	room.guest_side =
		hostGetsTigers
			? "goat"
			: "tiger";
}


// ------------------------------------------------------------
// STAKE
// ------------------------------------------------------------

function sanitizeStake(value) {

	const parsed =
		Number.parseInt(
			value,
			10
		);


	if (
		!Number.isFinite(parsed)
	) {
		return 0;
	}


	if (
		parsed < 0
	) {
		return 0;
	}


	return Math.min(
		parsed,
		1000000
	);
}


// ------------------------------------------------------------
// WIN REWARD
// ------------------------------------------------------------

function getWinnerReward(room) {

	if (
		room.stake > 0
	) {
		return (
			room.stake * 2
		);
	}


	return 5;
}


// ------------------------------------------------------------
// FINISH GAME
// ------------------------------------------------------------

function finishGame(
	room,
	roomCode,
	winnerSide,
	reason = "normal"
) {

	if (
		room.finished
	) {
		return;
	}


	if (
		winnerSide !== "tiger"
		&& winnerSide !== "goat"
	) {
		return;
	}


	room.finished =
		true;


	room.winner_side =
		winnerSide;


	const winnerReward =
		getWinnerReward(
			room
		);


	const hostWon =
		room.host_side ===
		winnerSide;


	const guestWon =
		room.guest_side ===
		winnerSide;


	send(
		room.host,
		{
			type:
				"game_finished",

			winner_side:
				winnerSide,

			you_won:
				hostWon,

			reward:
				hostWon
					? winnerReward
					: 0,

			stake:
				room.stake,

			pot:
				room.stake > 0
					? room.stake * 2
					: 0,

			reason:
				reason
		}
	);


	send(
		room.guest,
		{
			type:
				"game_finished",

			winner_side:
				winnerSide,

			you_won:
				guestWon,

			reward:
				guestWon
					? winnerReward
					: 0,

			stake:
				room.stake,

			pot:
				room.stake > 0
					? room.stake * 2
					: 0,

			reason:
				reason
		}
	);


	console.log(
		`Game finished: ${roomCode}`
		+ ` | winner=${winnerSide}`
		+ ` | reward=${winnerReward}`
		+ ` | reason=${reason}`
	);
}


// ------------------------------------------------------------
// ROOM READY
// ------------------------------------------------------------

function sendRoomReady(
	room,
	roomCode
) {

	send(
		room.host,
		{
			type:
				"room_ready",

			code:
				roomCode,

			your_side:
				room.host_side,

			opponent_side:
				room.guest_side,

			theme_id:
				room.theme_id,

			stake:
				room.stake,

			pot:
				room.stake * 2,

			game_started:
				room.game_started
		}
	);


	send(
		room.guest,
		{
			type:
				"room_ready",

			code:
				roomCode,

			your_side:
				room.guest_side,

			opponent_side:
				room.host_side,

			theme_id:
				room.theme_id,

			stake:
				room.stake,

			pot:
				room.stake * 2,

			game_started:
				room.game_started
		}
	);
}


// ============================================================
// CONNECTION
// ============================================================

wss.on(
	"connection",
	(socket) => {

		console.log(
			"Client connected"
		);


		// ====================================================
		// MESSAGE
		// ====================================================

		socket.on(
			"message",
			(raw) => {

				let message;


				try {

					message =
						JSON.parse(
							raw.toString()
						);

				}
				catch {

					send(
						socket,
						{
							type:
								"error",

							message:
								"Invalid message"
						}
					);

					return;
				}


				// ============================================
				// CREATE ROOM
				// ============================================

				if (
					message.type ===
					"create_room"
				) {

					let roomCode =
						generateRoomCode();


					while (
						rooms.has(
							roomCode
						)
					) {

						roomCode =
							generateRoomCode();

					}


					const selectedSide =
						[
							"tiger",
							"goat",
							"random"
						].includes(
							message.selected_side
						)
							? message.selected_side
							: "random";


					const stake =
						sanitizeStake(
							message.stake
						);


					rooms.set(
						roomCode,
						{
							host:
								socket,

							guest:
								null,

							theme_id:
								message.theme_id
								?? "basic",

							selected_side:
								selectedSide,

							host_side:
								"",

							guest_side:
								"",

							stake:
								stake,

							stake_accepted_by_host:
								true,

							stake_accepted_by_guest:
								false,

							game_started:
								false,

							finished:
								false,

							winner_side:
								""
						}
					);


					socket.roomCode =
						roomCode;

					socket.roomRole =
						"host";


					send(
						socket,
						{
							type:
								"room_created",

							code:
								roomCode,

							stake:
								stake,

							pot:
								stake * 2
						}
					);


					console.log(
						`Room created: ${roomCode}`
						+ ` | side=${selectedSide}`
						+ ` | stake=${stake}`
					);


					return;
				}


				// ============================================
				// PREVIEW ROOM
				// ============================================

				if (
					message.type ===
					"preview_room"
				) {

					const roomCode =
						String(
							message.code
							?? ""
						)
							.trim()
							.toUpperCase();


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {

						send(
							socket,
							{
								type:
									"room_preview_failed",

								message:
									"Room not found"
							}
						);

						return;
					}


					if (
						room.guest
					) {

						send(
							socket,
							{
								type:
									"room_preview_failed",

								message:
									"Room is full"
							}
						);

						return;
					}


					send(
						socket,
						{
							type:
								"room_preview",

							code:
								roomCode,

							stake:
								room.stake,

							pot:
								room.stake * 2,

							reward_if_no_stake:
								5,

							theme_id:
								room.theme_id
						}
					);


					return;
				}


				// ============================================
				// JOIN ROOM
				// ============================================

				if (
					message.type ===
					"join_room"
				) {

					const roomCode =
						String(
							message.code
							?? ""
						)
							.trim()
							.toUpperCase();


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {

						send(
							socket,
							{
								type:
									"join_failed",

								message:
									"Room not found"
							}
						);

						return;
					}


					if (
						room.guest
					) {

						send(
							socket,
							{
								type:
									"join_failed",

								message:
									"Room is full"
							}
						);

						return;
					}


					room.guest =
						socket;


					socket.roomCode =
						roomCode;

					socket.roomRole =
						"guest";


					assignSides(
						room
					);


					if (
						room.stake === 0
					) {

						room.stake_accepted_by_guest =
							true;

						room.game_started =
							true;

					}


					sendRoomReady(
						room,
						roomCode
					);


					send(
						room.host,
						{
							type:
								"player_joined",

							code:
								roomCode
						}
					);


					if (
						room.stake > 0
					) {

						send(
							room.guest,
							{
								type:
									"stake_offer",

								stake:
									room.stake,

								pot:
									room.stake * 2
							}
						);


						send(
							room.host,
							{
								type:
									"waiting_for_stake_acceptance",

								stake:
									room.stake
							}
						);

					}
					else {

						send(
							room.host,
							{
								type:
									"game_start",

								stake:
									0,

								reward_if_win:
									5
							}
						);


						send(
							room.guest,
							{
								type:
									"game_start",

								stake:
									0,

								reward_if_win:
									5
							}
						);

					}


					return;
				}


				// ============================================
				// ACCEPT STAKE
				// ============================================

				if (
					message.type ===
					"accept_stake"
				) {

					const roomCode =
						socket.roomCode;


					if (!roomCode) {
						return;
					}


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {
						return;
					}


					if (
						socket.roomRole !==
						"guest"
					) {
						return;
					}


					if (
						room.stake <= 0
					) {
						return;
					}


					room.stake_accepted_by_guest =
						true;


					room.game_started =
						true;


					const pot =
						room.stake * 2;


					send(
						room.host,
						{
							type:
								"stake_ready",

							stake:
								room.stake,

							pot:
								pot
						}
					);


					send(
						room.guest,
						{
							type:
								"stake_ready",

							stake:
								room.stake,

							pot:
								pot
						}
					);


					send(
						room.host,
						{
							type:
								"game_start",

							stake:
								room.stake,

							reward_if_win:
								pot
						}
					);


					send(
						room.guest,
						{
							type:
								"game_start",

							stake:
								room.stake,

							reward_if_win:
								pot
						}
					);


					return;
				}


				// ============================================
				// DECLINE STAKE
				// ============================================

				if (
					message.type ===
					"decline_stake"
				) {

					const roomCode =
						socket.roomCode;


					if (!roomCode) {
						return;
					}


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {
						return;
					}


					if (
						socket.roomRole !==
						"guest"
					) {
						return;
					}


					send(
						room.host,
						{
							type:
								"stake_declined"
						}
					);


					room.guest =
						null;

					room.host_side =
						"";

					room.guest_side =
						"";

					room.stake_accepted_by_guest =
						false;

					room.game_started =
						false;


					socket.roomCode =
						null;

					socket.roomRole =
						null;


					send(
						socket,
						{
							type:
								"left_room"
						}
					);


					return;
				}


				// ============================================
				// GAME MOVE
				// ============================================

				if (
					message.type ===
					"move"
				) {

					const roomCode =
						socket.roomCode;


					if (!roomCode) {
						return;
					}


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {
						return;
					}


					if (
						!room.game_started
						|| room.finished
					) {
						return;
					}


					const opponent =
						socket.roomRole ===
						"host"
							? room.guest
							: room.host;


					if (!opponent) {
						return;
					}


					send(
						opponent,
						{
							type:
								"move",

							move:
								message.move
						}
					);


					return;
				}


				// ============================================
				// GAME OVER
				// ============================================

				if (
					message.type ===
					"game_over"
				) {

					const roomCode =
						socket.roomCode;


					if (!roomCode) {
						return;
					}


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {
						return;
					}


					if (
						!room.game_started
						|| room.finished
					) {
						return;
					}


					const winnerSide =
						String(
							message.winner_side
							?? ""
						);


					if (
						winnerSide !==
							"tiger"
						&& winnerSide !==
							"goat"
					) {

						send(
							socket,
							{
								type:
									"error",

								message:
									"Invalid winner"
							}
						);

						return;
					}


					finishGame(
						room,
						roomCode,
						winnerSide,
						"normal"
					);


					return;
				}


				// ============================================
				// LEAVE ROOM
				// ============================================

				if (
					message.type ===
					"leave_room"
				) {

					const roomCode =
						socket.roomCode;


					if (!roomCode) {
						return;
					}


					const room =
						rooms.get(
							roomCode
						);


					if (!room) {
						return;
					}


					// ========================================
					// ACTIVE GAME = FORFEIT
					// ========================================

					if (
						room.game_started
						&& !room.finished
						&& room.host
						&& room.guest
					) {

						const leavingSide =
							socket.roomRole ===
								"host"
									? room.host_side
									: room.guest_side;


						const winnerSide =
							leavingSide ===
								"tiger"
									? "goat"
									: "tiger";


						finishGame(
							room,
							roomCode,
							winnerSide,
							"forfeit"
						);


						const otherSocket =
							socket.roomRole ===
								"host"
									? room.guest
									: room.host;


						socket.roomCode =
							null;

						socket.roomRole =
							null;


						if (
							otherSocket
						) {

							otherSocket.roomCode =
								null;

							otherSocket.roomRole =
								null;

						}


						rooms.delete(
							roomCode
						);


						console.log(
							`Player forfeited: ${roomCode}`
							+ ` | loser=${leavingSide}`
							+ ` | winner=${winnerSide}`
						);


						return;
					}


					// ========================================
					// NORMAL HOST LEAVE BEFORE GAME
					// ========================================

					if (
						socket.roomRole ===
						"host"
					) {

						if (
							room.guest
						) {

							send(
								room.guest,
								{
									type:
										"room_closed"
								}
							);

						}


						rooms.delete(
							roomCode
						);


						socket.roomCode =
							null;

						socket.roomRole =
							null;


						return;
					}


					// ========================================
					// NORMAL GUEST LEAVE BEFORE GAME
					// ========================================

					if (
						socket.roomRole ===
						"guest"
					) {

						room.guest =
							null;

						room.host_side =
							"";

						room.guest_side =
							"";

						room.stake_accepted_by_guest =
							false;

						room.game_started =
							false;


						send(
							room.host,
							{
								type:
									"player_left"
							}
						);


						socket.roomCode =
							null;

						socket.roomRole =
							null;


						return;
					}
				}


				// ============================================
				// UNKNOWN MESSAGE
				// ============================================

				send(
					socket,
					{
						type:
							"error",

						message:
							"Unknown message type"
					}
				);
			}
		);


		// ====================================================
		// DISCONNECT
		// ====================================================

		socket.on(
			"close",
			() => {

				console.log(
					"Client disconnected"
				);


				const roomCode =
					socket.roomCode;


				if (
					!roomCode
				) {
					return;
				}


				const room =
					rooms.get(
						roomCode
					);


				if (
					!room
				) {
					return;
				}


				// ============================================
				// ACTIVE GAME DISCONNECT = FORFEIT
				// ============================================

				if (
					room.game_started
					&& !room.finished
					&& room.host
					&& room.guest
				) {

					const leavingSide =
						socket.roomRole ===
							"host"
								? room.host_side
								: room.guest_side;


					const winnerSide =
						leavingSide ===
							"tiger"
								? "goat"
								: "tiger";


					finishGame(
						room,
						roomCode,
						winnerSide,
						"disconnect"
					);


					const otherSocket =
						socket.roomRole ===
							"host"
								? room.guest
								: room.host;


					if (
						otherSocket
					) {

						otherSocket.roomCode =
							null;

						otherSocket.roomRole =
							null;

					}


					rooms.delete(
						roomCode
					);


					console.log(
						`Player disconnected and forfeited: ${roomCode}`
						+ ` | loser=${leavingSide}`
						+ ` | winner=${winnerSide}`
					);


					return;
				}


				// ============================================
				// HOST DISCONNECT BEFORE GAME
				// ============================================

				if (
					socket.roomRole ===
					"host"
				) {

					if (
						room.guest
					) {

						send(
							room.guest,
							{
								type:
									"room_closed"
							}
						);

					}


					rooms.delete(
						roomCode
					);


					return;
				}


				// ============================================
				// GUEST DISCONNECT BEFORE GAME
				// ============================================

				if (
					socket.roomRole ===
					"guest"
				) {

					room.guest =
						null;

					room.host_side =
						"";

					room.guest_side =
						"";

					room.stake_accepted_by_guest =
						false;

					room.game_started =
						false;


					send(
						room.host,
						{
							type:
								"player_left"
						}
					);

				}
			}
		);
	}
);


// ============================================================
// START SERVER
// ============================================================

server.listen(
	PORT,
	"0.0.0.0",
	() => {

		console.log(
			`Server running on port ${PORT}`
		);

	}
);