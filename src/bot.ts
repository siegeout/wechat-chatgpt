import { config } from "./config.js";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Message } from "wechaty";
import {sendMessage} from "./chatgpt.js";
import { IMessage } from "./interface";

enum MessageType {
  Unknown = 0,

  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}

const conversationMap =  new Map()
const messageMap: Map<string, IMessage[]> = new Map()

const SINGLE_MESSAGE_MAX_SIZE = 500;
export class ChatGPTBot {
  chatPrivateTiggerKeyword = config.chatPrivateTiggerKeyword;
  chatTiggerRule = config.chatTiggerRule? new RegExp(config.chatTiggerRule): undefined;
  disableGroupMessage = config.disableGroupMessage || false;
  botName: string = "";
  ready = false;
  setBotName(botName: string) {
    this.botName = botName;
  }
  get chatGroupTiggerRegEx(): RegExp {
    return new RegExp(`^@${this.botName}\\s`);
  }
  get chatPrivateTiggerRule(): RegExp | undefined {
    const { chatPrivateTiggerKeyword, chatTiggerRule } = this;
    let regEx = chatTiggerRule
    if (!regEx && chatPrivateTiggerKeyword) {
      regEx = new RegExp(chatPrivateTiggerKeyword)
    }
    return regEx
  }
  async command(): Promise<void> {}
  // remove more times conversation and mention
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    
    const { chatTiggerRule, chatPrivateTiggerRule } = this;
    
    if (privateChat && chatPrivateTiggerRule) {
      text = text.replace(chatPrivateTiggerRule, "")
    } else if (!privateChat) {
      text = text.replace(this.chatGroupTiggerRegEx, "")
      text = chatTiggerRule? text.replace(chatTiggerRule, ""): text
    }
    // remove more text via - - - - - - - - - - - - - - -
    return text
  }
  async getGPTMessage(text: IMessage[]): Promise<string> {
    return await sendMessage(text);
  }
  // The message is segmented according to its size
  async trySay(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }
  // Check whether the ChatGPT processing can be triggered
  tiggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const { chatTiggerRule } = this;
    let triggered = false;
    if (privateChat) {
      const regEx = this.chatPrivateTiggerRule
      triggered = regEx? regEx.test(text): true;
    } else {
      triggered = this.chatGroupTiggerRegEx.test(text);
      // group message support `chatTiggerRule`
      if (triggered && chatTiggerRule) {
        triggered = chatTiggerRule.test(text.replace(this.chatGroupTiggerRegEx, ""))
      }
    }
    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }
  // Filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      talker.self() ||
      // TODO: add doc support
      messageType !== MessageType.Text ||
      talker.name() === "微信团队" ||
      // 语音(视频)消息
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // 红包消息
      text.includes("收到红包，请在手机上查看") ||
      // Transfer message
      text.includes("收到转账，请在手机上查看") ||
      // 位置消息
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
  }




  async onPrivateMessage(talker: ContactInterface, text: string) {
    const talkerId = talker.id;
    let messageList=messageMap.get(talkerId)
    let gptMessage='已重置'
    if (text=='重置'){
      messageList=[]
      messageMap.set(talkerId,messageList)
    }else{
      if (!messageList) {
        messageList= [];
     }
     messageList.push({"role": "user", "content": text})
     gptMessage = await this.getGPTMessage(messageList);
     gptMessage=gptMessage.trim()
     if (gptMessage!='网络异常,请稍后重试'){
       messageList.push({"role": "assistant", "content": gptMessage})
       this.dealMessage(messageList)
       messageMap.set(talkerId,messageList)
     }else{
       messageList.shift();
     }
    }
    await this.trySay(talker, gptMessage);
  }

  dealMessage(messageList:IMessage[]){
    const serialized_data = JSON.stringify(messageList)
    if (serialized_data.length>4500){
      let top= messageList.shift();
      if (top!=undefined){
        console.log(`🎯 remove message: ${top.content}`);
      }
    }
  }
  async onGroupMessage(
    talker: ContactInterface,
    text: string,
    room: RoomInterface
  ) {
    let messageList=messageMap.get(room.id+talker.id)
    let gptMessage='已重置'
    if (text=='重置'){
      messageList=[]
      messageMap.set(room.id+talker.id,messageList)
    }else{
      if (!messageList) {
        messageList= [];
     }
     messageList.push({"role": "user", "content": text})
     gptMessage = await this.getGPTMessage(messageList);
     gptMessage=gptMessage.trim()
     if (gptMessage!='网络异常,请稍后重试'){
       messageList.push({"role": "assistant", "content": gptMessage})
       this.dealMessage(messageList)
       messageMap.set(room.id+talker.id,messageList)
      }else {
         messageList.shift();
     }
    }
    const result = `@${talker.name()} ${text}\n\n------ ${gptMessage}`;
    await this.trySay(room, result);
  }
  async onMessage(message: Message) {
    console.log(`🎯 ${message.date()} Message: ${message}`);
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const privateChat = !room;
    if (this.isNonsense(talker, messageType, rawText)) {
      return;
    }
    if (this.tiggerGPTMessage(rawText, privateChat)) {
      const text = this.cleanMessage(rawText, privateChat);
      if (privateChat) {
        return await this.onPrivateMessage(talker, text);
      } else{
        if (!this.disableGroupMessage){
          return await this.onGroupMessage(talker, text, room);
        } else {
          return;
        }
      }
    } else {
      return;
    }
  }
}