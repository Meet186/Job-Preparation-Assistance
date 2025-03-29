const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config(); // Load environment variables from .env

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors()); // Allow frontend requests

// Store interview context per user (temporary; use DB for persistence)
let userSessions = {};

// System prompt to ensure AI stays in character
const SYSTEM_PROMPT = `
You are an AI interviewer conducting a technical interview for a job role.
Rules:
- Only ask one question at a time.
- Never break character or acknowledge that you are an AI.
- Do not answer the questions yourself unless asked.
- Evaluate responses and provide brief feedback.
- Ask follow-up questions based on the answers.
`;

// Route to start the interview session
app.post("/start_interview", (req, res) => {
  const { user_id, role } = req.body;

  if (!user_id || !role) {
    return res.status(400).json({ error: "Missing user_id or role" });
  }

  const prompt = `${SYSTEM_PROMPT}\nConduct an interview for the role of ${role}.`;

  // Initialize user session
  userSessions[user_id] = [{ role: "system", content: prompt }];

  return res.json({ message: "Interview started", role });
});

// Route to ask the next interview question
app.post("/ask_question", async (req, res) => {
  const { user_id } = req.body;

  if (!(user_id in userSessions)) {
    return res.status(400).json({ error: "No active interview session" });
  }

  // Get chat history
  const messages = userSessions[user_id];

  try {
    // Call OpenAI API to generate a question
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: messages,
        temperature: 0.2,
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const question = response.data.choices[0].message.content;

    // Store question in session
    messages.push({ role: "assistant", content: question });

    return res.json({ question });
  } catch (error) {
    return res.status(500).json({ error: `Error with OpenAI API: ${error.message}` });
  }
});

// Route to submit an answer and receive feedback
app.post("/submit_answer", async (req, res) => {
  const { user_id, answer } = req.body;

  if (!(user_id in userSessions)) {
    return res.status(400).json({ error: "No active interview session" });
  }

  // Get chat history
  const messages = userSessions[user_id];

  // Store user's answer
  messages.push({ role: "user", content: answer });

  // Generate feedback
  const feedbackPrompt = `
  Evaluate the candidate's answer based on:
  - Accuracy
  - Clarity
  - Depth of knowledge
  
  Give a **score out of 10** and suggest improvements.
  `;
  messages.push({ role: "system", content: feedbackPrompt });

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: messages,
        temperature: 0.3,
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const feedback = response.data.choices[0].message.content;

    // Store AI feedback
    messages.push({ role: "assistant", content: feedback });

    return res.json({ feedback });
  } catch (error) {
    return res.status(500).json({ error: `Error with OpenAI API: ${error.message}` });
  }
});

// Route to end the interview session
app.post("/end_interview", (req, res) => {
  const { user_id } = req.body;

  if (user_id in userSessions) {
    delete userSessions[user_id]; // Clear session
  }

  return res.json({ message: "Interview ended" });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
