import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

// Helper to convert File to generative part format
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
}

export const verifyCrashImage = async (imageFile) => {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Analyze this image for a road accident/car crash. 
Return: 
{ 
  "crash_detected": boolean, 
  "severity": "low" | "medium" | "high",
  "reason": "short explanation"
}`;

        const imagePart = await fileToGenerativePart(imageFile);
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        return JSON.parse(responseText);

    } catch (e) {
        console.error("Gemini AI Verification Error:", e);
        // Safety Fallback: Don't block the emergency, but mark as unverified
        return {
            crash_detected: true,
            severity: "medium",
            reason: "AI Verification Bypass (Technical Error)",
            is_fallback: true
        };
    }
}

export const generateFirstAid = async (incidentType, severity = 'unknown') => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `You are a certified emergency assistant. 
Provide structured first aid steps for a ${incidentType} emergency with ${severity} severity injuries.
Keep instructions short, actionable, and formatted in Markdown bullet points. 
Focus on immediate life-saving actions.`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("Gemini First Aid Error:", e);
        return `
# Immediate Actions:
- **Safety First**: Ensure the scene is safe.
- **Check Breathing**: Ensure the patient's airway is clear.
- **Stop Bleeding**: Apply pressure to wounds.
- **Stay Calm**: Wait for the first responder.
`;
    }
}
