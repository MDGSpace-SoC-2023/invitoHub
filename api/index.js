require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const multer = require("multer");
const uploadMiddleware = multer({ dest: "uploads/" });
const twilio = require("twilio");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const cookieParser = require("cookie-parser");

const salt = bcrypt.genSaltSync(10);

let user_id;
let post_id;

//Middlewares

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const port = 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//Functions

function connection() {
  try {
    mongoose.connect(process.env.DB_CONNECTION_URL);
    console.log("Connected to the Database");
  } catch (error) {
    console.log("Failed to connect to database" + error.message);
  }
}
connection();

function authenticateToken(req, res, next) {
  const { token } = req.cookies;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = user;
    next();
  });
}

async function listConnectionNames(auth) {
  const service = google.people({
    version: "v1",
    auth: auth,
  });
  const res = await service.people.connections.list({
    resourceName: "people/me",
    pageSize: 1000,
    personFields: "names,phoneNumbers,emailAddresses",
  });
  const connections = res.data.connections;
  if (!connections || connections.length === 0) {
    console.log("No connections found.");
    return;
  }
  return connections;
}

function sendSMS(phoneNumber, message) {
  const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  return client.messages
    .create({
      body: message,
      from: "+13868668730",
      to: phoneNumber,
    })
    .then((message) => console.log(message, "message sent"))
    .catch((err) => console.log(err));
}

//Routes

app.post("/login", async (req, res) => {
  const email = req.body.email;
  const name = req.body.name;
  const token = bcrypt.hashSync(req.body.token, salt);
  console.log(email);
  try {
    let userDoc = await User.findOne({ email });
    if (!userDoc) {
      userDoc = await User.create({ name: name, email: email });
      console.log("user registered");
    } else {
      console.log("user logged in");
    }
    user_id = userDoc._id;
    jwt.sign({ token }, process.env.JWT_SECRET, {}, (err, token) => {
      if (err) throw err;
      res.cookie("token", token).json(userDoc);
    });
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

app.post("/get-contacts", authenticateToken, async (req, res) => {
  const email = req.body.email;
  const token = req.body.token.access_token;
  console.log(token);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });

  const contacts = await listConnectionNames(auth);

  const contactNames = contacts.map((person) =>
    person.names && person.names.length > 0 ? person.names[0].displayName : "No display name found"
  );

  const contactNumbers = contacts.map((person) =>
    person.phoneNumbers && person.phoneNumbers.length > 0
      ? person.phoneNumbers[0].value
      : "No Phone Number found"
  );

  console.log(contactNames);
  console.log(contactNumbers);

  try {
    const user = await User.findOne({ email });

    if (user) {
      user.contacts.names = [];
      user.contacts.phoneNumbers = [];
      user.contacts.names.push(...contactNames);
      user.contacts.phoneNumbers.push(...contactNumbers);
      await user.save();
      console.log("Contacts updated for user:", user);
      res.json({ message: "Contacts updated successfully" });
    } else {
      console.log("User not found");
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error updating contacts:", error);
    res.status(500).json({ error: "Failed to update contacts" });
  }
});

app.post("/post", authenticateToken, uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  console.log(originalname + " " + path);
  const newName = `uploads\\` + originalname;
  fs.renameSync(path, newName);
  const { title, description, publicEvent } = req.body;
  console.log(req.body);

  try {
    const postDoc = await Post.create({
      user_host: user_id,
      title,
      description,
      cover: newName,
      publicEvent: publicEvent,
    });
    post_id = postDoc._id;
    console.log("Post created: ", postDoc, post_id);
    res.json(postDoc);
  } catch (err) {
    console.log("Error while creating Post: " + err);
    res.status(400).json(err);
  }
});

app.post("/select-contacts", authenticateToken, async (req, res) => {
  const email = req.body.email;
  try {
    const user = await User.findOne({ email });
    const names = user.contacts.names;
    res.json(names);
  } catch (err) {
    res.status(400).json(err);
  }
});

app.post("/send-contacts", authenticateToken, async (req, res) => {
  const data = req.body.selectedContacts;
  const email = req.body.email;
  console.log(data);
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.json("no such user found");
    } else {
      const contacts = user.contacts.phoneNumbers;
      const contactArray = [];
      for (let i of data) {
        console.log(contacts[i]);
        contactArray.push(contacts[i]);
        const link = `http://localhost:3000/invited-event/${post_id}`;
        // sendSMS(contacts[i], `Text: ${link}`);
      }
      const postDoc = await Post.findOne({ _id: post_id });
      postDoc.users_invited.push(...contactArray);
      await postDoc.save();
      res.json({ post_id });
    }
  } catch (err) {
    console.log("Error while sending sms", err);
    res.status(400).json(err);
  }
});

app.get("/your-events", async (req, res) => {
  try {
    const postDocs = await Post.find({
      $or: [{ user_host: user_id }, { "attendees.users_registered": user_id }],
    });
    console.log(postDocs);
    res.json(postDocs);
  } catch (err) {
    console.log("Error while fetching your events: ", err);
    res.json(err);
  }
});

app.post("/invited-event", authenticateToken, async (req, res) => {
  const data = req.body.post_id;
  console.log(data);
  try {
    const postDoc = await Post.findOne({ _id: data });
    res.json(postDoc);
  } catch (err) {
    console.log("Error while finding Invited Post: ", err);
    res.status(400).json(err);
  }
});

app.post("/send-details", authenticateToken, async (req, res) => {
  const email = req.body.email;
  const data = req.body.post_id;
  console.log("data: ", data);
  try {
    const postDoc = await Post.findOne({ _id: data });
    const userDoc = await User.findOne({ email });
    const alreadyRegistered = postDoc.attendees.includes({ users_registered: userDoc._id });
    if (!alreadyRegistered) {
      postDoc.attendees.push({ users_registered: userDoc._id });
      await postDoc.save();
      res.json({
        message: "User posted: ",
        details: userDoc._id,
      });
    } else res.json("user already exists");
  } catch (err) {
    console.log("Error while sending details: ", err);
    res.status(400).json(err);
  }
});

app.get("/get-public-events", async (req, res) => {
  const posts = await Post.find({ publicEvent: true });
  res.json(posts);
});

app.post("/get-event-info", authenticateToken, async (req, res) => {
  const data = req.body.post_id;
  console.log(data);
  try {
    const postDoc = await Post.findOne({ _id: data });
    res.json(postDoc);
  } catch (err) {
    console.log("Error while getting event info: ", err);
    res.status(400).json(err);
  }
});

app.post("/get-registered-contact-names", authenticateToken, async (req, res) => {
  const data = req.body.registeredContactsId;
  console.log(data);
  try {
    let registeredContactNames = [];
    for (let userId of data) {
      let temp = await User.findOne({ _id: userId });
      console.log("temp: ", temp);
      if (temp) {
        registeredContactNames.push(temp.name);
      }
    }
    console.log(registeredContactNames);
    res.json(registeredContactNames);
  } catch (err) {
    res.status(500).json({
      error: "Error while fetching registered contact names",
      details: err,
    });
  }
});

app.post("/rsvp", authenticateToken, async (req, res) => {
  const data = req.body.attending;
  const postid = req.body.post_id;
  console.log(data);
  try {
    const postDoc = await Post.findOneAndUpdate(
      { _id: postid, "attendees.users_registered": user_id },
      { $set: { "attendees.$.rsvp": data } },
      { new: true }
    );
    res.json({ message: "RSVP updated successfully", postDoc });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
});
