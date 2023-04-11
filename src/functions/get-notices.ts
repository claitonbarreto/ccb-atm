import puppeteer from "puppeteer";
import { getChrome } from "../utils/chrome-script";
import { MongoClient } from "mongodb";
import AWS from 'aws-sdk';

export async function handler() {

  const chrome = await getChrome();

  AWS.config.update({region: 'us-east-1'});

  const browser = await puppeteer.connect({
    browserWSEndpoint: chrome.endpoint,
  });

  const page = await browser.newPage();

  await page.goto('https://congregacaocristanobrasil.org.br/circular');

  await page.setViewport({width: 1080, height: 1024});

  const allElements = await page.$$('.circular .box h2 small');
  const elements = [];

  for (const element of allElements) {
    const noticeIdentifier = await (await element.getProperty('textContent')).jsonValue();
    const noticeType = noticeIdentifier?.split(' ')[0].toLocaleLowerCase();
    const noticeNumber = noticeIdentifier?.split(' ')[2];

    elements.push({noticeIdentifier, noticeType, noticeNumber});
  }

  const noticesUrls: string[] = [];

  const mongoDbConnectionString = 'mongodb+srv://cbarreto_dev:93e674401cc41e944a32a2bec76f3dfa942ce9c8@cluster0.dy1xd.mongodb.net/?retryWrites=true&w=majority';
  const dbName = 'ccb_atm';
  const mongoClient = new MongoClient(mongoDbConnectionString);

  await mongoClient.connect();

  const db = mongoClient.db(dbName);
  const collection = db.collection('last_notice_id');
  const data = await collection.find().toArray();
  const last_notice_title = data[0].last_notice_title;

  console.log({last_notice_title});

  for(let i = 0; i < elements.length; i++) {

    if(last_notice_title.trim() != elements[i].noticeIdentifier?.trim()) {
      const url = `https://congregacaocristanobrasil.org.br/circular?id=${elements[i].noticeNumber}&t=${elements[i].noticeType}`

      await page.goto(url);

      const titleElement = await page.$('.title h1');

      if(titleElement) {
        const rawNotiveTitle = await (await titleElement?.getProperty('textContent'))!.jsonValue();
        const noticeTitle = rawNotiveTitle?.trim();

        noticesUrls.push(`<p><strong> ${elements[i].noticeIdentifier} - ${noticeTitle} </strong> | <a href="${url}">Link para acesso direto</a></p>`);
      }
    }
    else break;
  }

  await db.collection('last_notice_id').updateOne({last_notice_title}, {$set: {last_notice_title: elements[0].noticeIdentifier}})

  let emailSubject = 'CCB - Nova Circular Publicada';
  let emailBodyInitialText = 'Foi publicada uma nova circular para a irmandade CCB';

  if(noticesUrls.length) {
    if(noticesUrls.length > 1) {
      emailSubject = 'CCB - Novas Circulares Publicadas';
      emailBodyInitialText = 'Foram publicadas uma novas circulares para a irmandade CCB';
    }
  
    const params = {
      Destination: { 
        ToAddresses: [
          'claitonbarreto@gmail.com'
        ]
      },
      Message: { 
        Body: { 
          Html: {
            Charset: "UTF-8",
            Data: `<p>${emailBodyInitialText}<p> ${noticesUrls.map(notice => `${notice}`)}`
          }
          },
        Subject: {
          Charset: 'UTF-8',
          Data: emailSubject
        }
        },
      Source: 'claitonbarreto@gmail.com',
      ReplyToAddresses: [
          'claitonbarreto@gmail.com'
      ],
    };
  
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
  
    sendPromise.then(
      function(data) {
        console.log(data.MessageId);
      }).catch(
        function(err) {
        console.error(err, err.stack);
      });
  }
 
  await browser.close();
}