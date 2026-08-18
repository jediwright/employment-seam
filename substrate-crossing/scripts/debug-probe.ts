import 'dotenv/config';
import { AtpAgent } from '@atproto/api';
import WebSocket from 'ws';

(async () => {
  const agent = new AtpAgent({ service: process.env.PDS_SERVICE ?? 'https://bsky.social' });
  await agent.login({ identifier: process.env.PDS_HANDLE!, password: process.env.PDS_APP_PASSWORD! });
  const did = agent.session!.did;
  console.log('DID:', did);
  const ws = new WebSocket('wss://jetstream1.us-east.bsky.network/subscribe');
  let count = 0;
  ws.on('open', async () => {
    console.log('relay open (unfiltered)');
    const t = Date.now();
    const res = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.whtwnd.blog.entry',
      record: { $type: 'com.whtwnd.blog.entry', title: 'debug probe', content: 'debug', createdAt: new Date().toISOString(), visibility: 'public' },
    });
    console.log('record written (+' + (Date.now() - t) + 'ms):', res.data.uri);
  });
  ws.on('message', (d) => {
    count++;
    const e = JSON.parse(d.toString());
    if (e.did === did) console.log('>>> OUR EVENT (event #' + count + '):', JSON.stringify(e).slice(0, 400));
  });
  setTimeout(() => { console.log('done — total events seen:', count); ws.close(); process.exit(0); }, 60000);
})();
