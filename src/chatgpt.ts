import {config} from "./config.js";
import { IMessage } from "./interface";

let apiKey = config.openai_api_key;
let model = config.model;
const sendMessage = async (messages:IMessage[]) => {
  console.log(messages)
  try {
    const response = await fetch(`https://open.orangehome.me/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.6
      }),
    });
    return response.json()
      .then((data) => data.choices[0].message.content);
  } catch (e) {
    console.error(e)
    return "网络异常,请稍后重试"
  }
}

export {sendMessage};