	
import launchChrome from "@serverless-chrome/lambda";
import request from "superagent";
 
export const getChrome = async () => {
  const chrome = await launchChrome();
 
  const response = await request
    .get(`${chrome.url}/json/version`)
    .set("Content-Type", "application/json");
 
  const endpoint = response.body.webSocketDebuggerUrl;
 
  return {
    endpoint,
    instance: chrome
  };
};