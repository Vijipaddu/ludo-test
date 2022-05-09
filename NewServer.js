const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql");
const bodyParser = require("body-parser");


const app = express();

const jwt = require('jsonwebtoken');

const {
    rooms,
    users,
    nameToSocketId,
    addUser,
    removeUser,
    colors,
    nextObject,
  } = require("./utility.js");

  
  
  const port = process.env.PORT || 5000;
  
  const router = require("./router");

app.use(express.json());
app.use(cors());

const db = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "password",
	database: "nodelogin",
});



app.post('/register', (req, res) => {

	const username = req.body.username;
	const password = req.body.password;
	const email = req.body.email;
  

	db.query("INSERT INTO accounts(username,password,email,coins,Wins,Lose) VALUES (?,?,?,?,?,?)", [username, password, email,1000,0,0], (err, result) => {
		console.log(err);
	})
})



//app.post('/data', (req, res) => {
  //console.log(' +++++++++++++ '+req.body.username + req.body.password);

  // const coins = db.query(`SELECT coins FROM accounts WHERE username='${req.body.username}';`, function(err, coin_res){
  // const wins = db.query(`SELECT wins FROM accounts WHERE username='${req.body.username}';`, function(err, win_res) {
  // console.log(coin_res[0].coins);
  // console.log(win_res[0].wins);
  // const res_map = { 
  //   coins:coin_res[0].coins, 
  //   wins: win_res[0].wins
  // }
  // res.status(200).json(res_map);
  //   });
    
  // });
  //console.log(`SELECT coins FROM accounts WHERE username='${req.body.username}';`);
  
  // console.log(JSON.stringify(coins.RowDataPacket))
  // console.log(JSON.stringify(wins))
  // console.log(getCookie("username"));



  
  

//})

const parser = bodyParser.json();

const verifyJWT = (req, res, next) => {
	const token = req.headers["x-access-token"]

	if (!token) {
		res.send("Need a token");
	} else {
		jwt.verify(token, "jwtsecret", (err, decoded) => {
			if (err) {
				res.json({ auth: false, message: "Not Authenticated" });
			} else {
				req.userId = decoded.id;
				next();
			}
		})
	}
}

app.get('/isUserAuthenticated', verifyJWT, (req, res) => {

	res.status(200).json({message:"You are Authenticated"});

})

app.post('/login', (req, res) => {
	const username = req.body.username;
	const password = req.body.password;

  

	// const sqlInsert = "INSERT INTO user_details (username, password) VALUES (?,?)";
	db.query("SELECT * FROM accounts WHERE username = ? AND password = ?", [username, password], (err, result) => {
		if (err) {
			res.send({ err: err });
		}
		
		console.log(result); // If the account exists
		if (result.length > 0) {
			// Authenticate the user
			const id = result[0].id;
			const token = jwt.sign({ id }, "jwtsecret", {
				expiresIn: 300,
			})

      // let querr = "INSERT INTO accounts(session) WHERE username ="+ username +"VALUES (?)"; 
      // db.query(querr, [token], (err, result) => {
      //   console.log(err);
      // })

			res.json({ auth: true, token: token, result: result });
		} else {
			res.json({ auth: false, message: "Incorrect username and password" });
		}
		res.end();
	});
});

if (process.env.NODE_ENV === "production") {
    app.use(express.static("client/build"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
    });
  }

  // app.listen(3001, () => {
  //   console.log("running on port 3001");
  // });

const io = socketio(app.listen(3001), { transports: ["websocket", "polling"] });
app.use(router);
  
const getKeyByValue = (object, value) => {
    return Object.keys(object).find((key) => object[key] === value);
};
io.on("connection", (socket) => {
    console.log("connected");
  
    socket.on("join", ({ name, roomId, host }, cb) => {
      const errObj = addUser({ name, roomId, socketId: socket.id });
      if (host) {
        io.to(socket.id).emit("host", {});
      }
      if (errObj && errObj.error) return cb(errObj.error);
      socket.join(roomId);
      io.in(roomId).emit("members", rooms[roomId]);
    }); 
    socket.on("start", () => {
        let room = users[socket.id].roomId;
        colors[room] = ["blue", "red", "green", "yellow"];
        let tempNextObject = {};
        tempNextObject[nameToSocketId[rooms[room][rooms[room].length - 1]]] =
          nameToSocketId[rooms[room][0]];
        for (let i = 0; i < rooms[room].length; i++) {
          let tempSocketId = nameToSocketId[rooms[room][i]];
          if (i + 1 < rooms[room].length) {
            tempNextObject[tempSocketId] = nameToSocketId[rooms[room][i + 1]];
          }
          io.to(tempSocketId).emit("start", {});
          io.to(tempSocketId).emit("color", {
            myColor: colors[room].shift(),
          });
          if (i === 0) {
            io.to(tempSocketId).emit("turn", {});
          }
          io.to(tempSocketId).emit("names", rooms[room]);
          io.to(tempSocketId).emit("name", users[tempSocketId].name);
        }
        nextObject[room] = tempNextObject;
    });

    socket.on("board", (board) => {
        let room = users[socket.id].roomId;
        socket.to(room).emit("board", board);
      });
    
    socket.on("turn", () => {
        if (users[socket.id]) {
          io.to(nextObject[users[socket.id].roomId][socket.id]).emit("turn", {});
        }
    });
    
    socket.on("finish", () => {
        let room = users[socket.id].roomId;
        let key = getKeyByValue(nextObject[room], socket.id);
        nextObject[room][key] = nextObject[room][socket.id];
    });
    
    
    socket.on("sendMessage", (message, callback) => {
        const tempUser = users[socket.id];

        io.in(tempUser.roomId).emit("message", {
            user: tempUser.name,
            text: message,
        });

        callback();
    });

    socket.on("disconnect", () => {
        if (users[socket.id]) {
          roomId = users[socket.id].roomId;
          if (nextObject[roomId]) {
            let key = getKeyByValue(nextObject[roomId], socket.id);
            if (nextObject[roomId][key]) {
              nextObject[roomId][key] = nextObject[roomId][socket.id];
            }
          }
          removeUser(socket.id);
          io.in(roomId).emit("members", rooms[roomId]);
          io.in(roomId).emit("names", rooms[roomId]);
        }
        console.log(rooms);
        console.log("user has left!!");
      });
    });
