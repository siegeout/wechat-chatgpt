export interface IConfig {
  openai_api_key: string;
  model: string;
  chatPrivateTiggerKeyword: string;
  chatTiggerRule: string;
  disableGroupMessage: boolean;
}


export interface IMessage {
  role: string;
  content: string;
}