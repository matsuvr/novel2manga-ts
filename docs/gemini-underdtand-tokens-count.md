Understand and count tokens

Python JavaScript Go

Gemini and other generative AI models process input and output at a granularity called a token.

About tokens
Tokens can be single characters like z or whole words like cat. Long words are broken up into several tokens. The set of all tokens used by the model is called the vocabulary, and the process of splitting text into tokens is called tokenization.

For Gemini models, a token is equivalent to about 4 characters. 100 tokens is equal to about 60-80 English words.

When billing is enabled, the cost of a call to the Gemini API is determined in part by the number of input and output tokens, so knowing how to count tokens can be helpful.

Count tokens
All input to and output from the Gemini API is tokenized, including text, image files, and other non-text modalities.

You can count tokens in the following ways:

Call countTokens with the input of the request.
This returns the total number of tokens in the input only. You can make this call before sending the input to the model to check the size of your requests.

Use the usageMetadata attribute on the response object after calling generate_content.
This returns the total number of tokens in both the input and the output: totalTokenCount.
It also returns the token counts of the input and output separately: promptTokenCount (input tokens) and candidatesTokenCount (output tokens). And if you are using Context caching, the cached token count will be in cachedContentTokenCount.

If you are using a thinking model like the 2.5 ones, the token used during the thinking process are returned in thoughtsTokenCount.

Count text tokens
If you call countTokens with a text-only input, it returns the token count of the text in the input only (totalTokens). You can make this call before calling generateContent to check the size of your requests.

Another option is calling generateContent and then using the usageMetadata attribute on the response object to get the following:

The separate token counts of the input (promptTokenCount), the cached content (cachedContentTokenCount) and the output (candidatesTokenCount)
The token count for the thinking process (thoughtsTokenCount)
The total number of tokens in both the input and the output (totalTokenCount)

// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const prompt = "The quick brown fox jumps over the lazy dog.";
const countTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: prompt,
});
console.log(countTokensResponse.totalTokens);

const generateResponse = await ai.models.generateContent({
model: "gemini-2.5-flash",
contents: prompt,
});
console.log(generateResponse.usageMetadata);

Count multi-turn (chat) tokens
If you call countTokens with the chat history, it returns the total token count of the text from each role in the chat (totalTokens).

Another option is calling sendMessage and then using the usageMetadata attribute on the response object to get the following:

The separate token counts of the input (promptTokenCount), the cached content (cachedContentTokenCount) and the output (candidatesTokenCount)
The token count for the thinking process (thoughtsTokenCount)
The total number of tokens in both the input and the output (totalTokenCount)
To understand how big your next conversational turn will be, you need to append it to the history when you call countTokens.

// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Initial chat history.
const history = [
{ role: "user", parts: [{ text: "Hi my name is Bob" }] },
{ role: "model", parts: [{ text: "Hi Bob!" }] },
];
const chat = ai.chats.create({
model: "gemini-2.5-flash",
history: history,
});

// Count tokens for the current chat history.
const countTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: chat.getHistory(),
});
console.log(countTokensResponse.totalTokens);

const chatResponse = await chat.sendMessage({
message: "In one sentence, explain how a computer works to a young child.",
});
console.log(chatResponse.usageMetadata);

// Add an extra user message to the history.
const extraMessage = {
role: "user",
parts: [{ text: "What is the meaning of life?" }],
};
const combinedHistory = chat.getHistory();
combinedHistory.push(extraMessage);
const combinedCountTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: combinedHistory,
});
console.log(
"Combined history token count:",
combinedCountTokensResponse.totalTokens,
);

Count multimodal tokens
All input to the Gemini API is tokenized, including text, image files, and other non-text modalities. Note the following high-level key points about tokenization of multimodal input during processing by the Gemini API:

With Gemini 2.0, image inputs with both dimensions <=384 pixels are counted as 258 tokens. Images larger in one or both dimensions are cropped and scaled as needed into tiles of 768x768 pixels, each counted as 258 tokens. Prior to Gemini 2.0, images used a fixed 258 tokens.

Video and audio files are converted to tokens at the following fixed rates: video at 263 tokens per second and audio at 32 tokens per second.

Image files
If you call countTokens with a text-and-image input, it returns the combined token count of the text and the image in the input only (totalTokens). You can make this call before calling generateContent to check the size of your requests. You can also optionally call countTokens on the text and the file separately.

Another option is calling generateContent and then using the usageMetadata attribute on the response object to get the following:

The separate token counts of the input (promptTokenCount), the cached content (cachedContentTokenCount) and the output (candidatesTokenCount)
The token count for the thinking process (thoughtsTokenCount)
The total number of tokens in both the input and the output (totalTokenCount)
Note: You'll get the same token count if you use a file uploaded using the File API or you provide the file as inline data.
Example that uses an uploaded image from the File API:

// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const prompt = "Tell me about this image";
const organ = await ai.files.upload({
file: path.join(media, "organ.jpg"),
config: { mimeType: "image/jpeg" },
});

const countTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: createUserContent([
prompt,
createPartFromUri(organ.uri, organ.mimeType),
]),
});
console.log(countTokensResponse.totalTokens);

const generateResponse = await ai.models.generateContent({
model: "gemini-2.5-flash",
contents: createUserContent([
prompt,
createPartFromUri(organ.uri, organ.mimeType),
]),
});
console.log(generateResponse.usageMetadata);

Example that provides the image as inline data:

// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const prompt = "Tell me about this image";
const imageBuffer = fs.readFileSync(path.join(media, "organ.jpg"));

// Convert buffer to base64 string.
const imageBase64 = imageBuffer.toString("base64");

// Build contents using createUserContent and createPartFromBase64.
const contents = createUserContent([
prompt,
createPartFromBase64(imageBase64, "image/jpeg"),
]);

const countTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: contents,
});
console.log(countTokensResponse.totalTokens);

const generateResponse = await ai.models.generateContent({
model: "gemini-2.5-flash",
contents: contents,
});
console.log(generateResponse.usageMetadata);

Video or audio files
Audio and video are each converted to tokens at the following fixed rates:

Video: 263 tokens per second
Audio: 32 tokens per second
If you call countTokens with a text-and-video/audio input, it returns the combined token count of the text and the video/audio file in the input only (totalTokens). You can make this call before calling generateContent to check the size of your requests. You can also optionally call countTokens on the text and the file separately.

Another option is calling generateContent and then using the usageMetadata attribute on the response object to get the following:

The separate token counts of the input (promptTokenCount), the cached content (cachedContentTokenCount) and the output (candidatesTokenCount)
The token count for the thinking process (thoughtsTokenCount)
The total number of tokens in both the input and the output (totalTokenCount)
Note: You'll get the same token count if you use a file uploaded using the File API or you provide the file as inline data.

// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const prompt = "Tell me about this video";
let videoFile = await ai.files.upload({
file: path.join(media, "Big_Buck_Bunny.mp4"),
config: { mimeType: "video/mp4" },
});

// Poll until the video file is completely processed (state becomes ACTIVE).
while (!videoFile.state || videoFile.state.toString() !== "ACTIVE") {
console.log("Processing video...");
console.log("File state: ", videoFile.state);
await sleep(5000);
videoFile = await ai.files.get({ name: videoFile.name });
}

const countTokensResponse = await ai.models.countTokens({
model: "gemini-2.5-flash",
contents: createUserContent([
prompt,
createPartFromUri(videoFile.uri, videoFile.mimeType),
]),
});
console.log(countTokensResponse.totalTokens);

const generateResponse = await ai.models.generateContent({
model: "gemini-2.5-flash",
contents: createUserContent([
prompt,
createPartFromUri(videoFile.uri, videoFile.mimeType),
]),
});
console.log(generateResponse.usageMetadata);

System instructions and tools
System instructions and tools also count towards the total token count for the input.

If you use system instructions, the totalTokens count increases to reflect the addition of systemInstruction.

If you use function calling, the totalTokens count increases to reflect the addition of tools.
