import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import fs from 'fs';

async function testGemini() {
    const key = process.env.VITE_GEMINI_API_KEY;
    console.log("Testing with key:", key);
    if (!key) {
        console.error("No key found in .env");
        return;
    }
    const genAI = new GoogleGenerativeAI(key);
    try {
        console.log("Attempting with gemini-flash-latest...");
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent("Hello");
        console.log("gemini-flash-latest Response:", result.response.text());
        fs.writeFileSync('gemini_success.log', "Success: " + result.response.text());
    } catch (e) {
        console.error("Gemini Test Failed! Check gemini_error.log");
        const errorDetail = {
            name: e.constructor.name,
            message: e.message,
            stack: e.stack
        };
        fs.writeFileSync('gemini_error.log', JSON.stringify(errorDetail, null, 2));
    }
}

testGemini();
