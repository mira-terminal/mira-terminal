import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIResponsesAdapter } from '../src/openai-responses.js';

function fakeResponse({ ok=true, status=200, body, requestId='req_1' }) {
  return {
    ok,
    status,
    headers:{get:(name)=>name.toLowerCase()==='x-request-id'?requestId:null},
    json:async()=>structuredClone(body),
  };
}

test('Responses adapter sends configurable model and JSON-object mode without exposing key in body', async () => {
  let captured;
  const adapter=new OpenAIResponsesAdapter({
    apiKey:'secret-key',
    model:'configured-model',
    fetchImpl:async(url,options)=>{
      captured={url,options};
      return fakeResponse({body:{output:[{type:'message',content:[{type:'output_text',text:'{"complete":true}'}]}]}});
    },
  });
  const output=await adapter.generate({kind:'planning',input:{objective:'x'}});
  const body=JSON.parse(captured.options.body);
  assert.equal(captured.url,'https://api.openai.com/v1/responses');
  assert.equal(body.model,'configured-model');
  assert.deepEqual(body.text.format,{type:'json_object'});
  assert.equal(captured.options.headers.Authorization,'Bearer secret-key');
  assert.equal(captured.options.body.includes('secret-key'),false);
  assert.equal(output,'{"complete":true}');
});

test('Responses adapter maps optional schema to strict text.format json_schema', async () => {
  let body;
  const adapter=new OpenAIResponsesAdapter({
    apiKey:'k',model:'m',
    fetchImpl:async(_url,options)=>{
      body=JSON.parse(options.body);
      return fakeResponse({body:{output_text:'{"x":"ok"}'}});
    },
  });
  const schema={type:'object',properties:{x:{type:'string'}},required:['x'],additionalProperties:false};
  await adapter.generate({jsonSchema:schema,schemaName:'result'});
  assert.equal(body.text.format.type,'json_schema');
  assert.equal(body.text.format.name,'result');
  assert.equal(body.text.format.strict,true);
  assert.deepEqual(body.text.format.schema,schema);
});

test('Responses adapter surfaces sanitized API error and request id', async () => {
  const adapter=new OpenAIResponsesAdapter({
    apiKey:'top-secret',model:'m',
    fetchImpl:async()=>fakeResponse({ok:false,status:429,requestId:'req_limit',body:{error:{message:'rate limited'}}}),
  });
  await assert.rejects(
    ()=>adapter.generate({}),
    (error)=>{
      assert.match(error.message,/429/);
      assert.match(error.message,/req_limit/);
      assert.equal(error.message.includes('top-secret'),false);
      return true;
    },
  );
});

test('Responses adapter rejects incomplete responses', async () => {
  const adapter=new OpenAIResponsesAdapter({
    apiKey:'k',model:'m',
    fetchImpl:async()=>fakeResponse({body:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}}),
  });
  await assert.rejects(()=>adapter.generate({}),/max_output_tokens/);
});
