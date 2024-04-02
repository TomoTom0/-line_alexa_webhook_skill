"use strict";
/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const fetch = require("node-fetch");
const AWS = require("aws-sdk");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const url = "https://api.amazonalexa.com/v2/householdlists/";
const keys_necessary = {
    Header_Authorization: "Bearer TOKEN",
    // Method_Request: "GET",
    URL_Request: "https://hogehoge.php",
};
const Keys_Request = {
    Key_LineMessages: "messages",
    Key_LineMessageContent: "content",
    Key_LineMessageTimestamp: "timestamp",
    Key_hash: "hash"
}
const list_name = `Alexa to-do list`;
const list_name_speak = `やることリスト`;

let messages = [];
let hash = "";
let intent_before = null;

/*const URLs = {
    "metadata":()=>"v2/householdlists/",
    "list":(listId, status)=>`v2/householdlists/${listId}/${status}`,
    "listItem":(listId, itemId)=>`v2/householdlists/${listId}/items/${itemId}`
}*/


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        return await checkFunc(handlerInput, "manu");
    }
};


const setInfo = async (handlerInput, flag_check = true) => {
    const contextToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
    const headers = {
        "Authorization": `Bearer ${contextToken}`,
        "Content-Type": "application/json"
    };
    if (flag_check === true) {
        try {
            const res = await fetchCustom(handlerInput);
            if (res.ok === false) throw ("Fetch Failed");
            const speakOutput = `<speak>ラインを確認するための情報は不足していませんが、登録を続けますか?</speak>`;
            intent_before = "check to set info";
            return { ok: false, speakout: speakOutput, status: "check to register" }
        } catch (e) {
            true;
        }
    }

    const obtainInfo_fromList = async (res) => {
        if (Object.keys(res).indexOf("lists") === -1) {
            const speakout = `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE</phoneme>のトーク履歴を取得するための情報を保存する上で、` +
                `一時的にリストの読み込み・書き込み権限が必要です。スキルの設定を開いて権限を許可してください。` +
                `その後、改めてこのスキルを呼び出してください。</speak>`;
            return { speakout: speakout, ok: false, status: "no permissions", continue: false };
        }
        const list_valid_cands = res.lists.filter(d => d.name === `${list_name}`);
        // if (list_valid_cands.length === 0) {
        //     const speakout = `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE</phoneme>のトーク履歴を取得するための情報を保存する上で、` +
        //         `必要なリストが存在していません。「${list_name}」というリストを作成するので、そのリストに必要な情報を記載してください。` +
        //         `その後、改めてこのスキルを呼び出してください。</speak>`;
        //     return { speakout: speakout, ok: false, status: "no list", continue: true };
        // } else if (list_valid_cands.length > 1) {
        //     const speakout = `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE</phoneme>のトーク履歴を取得するための情報を保存する上で、` +
        //         `必要なリスト「${list_name}」が複数存在しています。不要なリストの名前を変更してください。` +
        //         `その後、改めてこのスキルを呼び出してください。</speak>`;
        //     return { speakout: speakout, ok: false, status: "dupulicated lists", continue: false };
        // }
        const list_valid = list_valid_cands[0];
        const keys_optional_pattern = [/Header_.*$/];
        const listId = list_valid.listId;
        const status = "active";

        const res_list = await fetch(url + `${listId}/${status}`, { method: "GET", headers: headers })
            .then(d => d.json());

        const items = res_list.items !== null ? res_list.items : [];
        const dict_item_exist = Object.assign(...items.map(d => {
            const arr = d.value.split(":");
            if (arr.length <= 1) return null;
            else return { [arr[0].replace("LINE_Check_", "").trim()]: arr.slice(1).join(":").trim() }
        }).filter(d => d !== null), {});
        // return dict_item_exist;
        const keys_item_exist = Object.keys(dict_item_exist);
        const keys_item_invalid = Object.keys(keys_necessary).filter(d => keys_item_exist.indexOf(d) === -1);
        if (keys_item_invalid.length > 0) {
            const speakout = `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE</phoneme>のトーク履歴を取得するための情報を保存する上で、` +
                `必要なリスト「${list_name_speak}」でいくつかの情報が不足しています。リストに<phoneme alphabet="x-amazon-pron-kana" ph="ライン チェック">LINE_Check</phoneme>から始まるアイテムを追加するので、` +
                `<phoneme alphabet="x-amazon-pron-kana" ph="コロン">: (コロン)</phoneme>の後に正しい情報を改めて入力してください。` +
                `その後、改めてこのスキルを呼び出してください。</speak>`;
            return { speakout: speakout, ok: false, status: "lack of items", keys_item_invalid: keys_item_invalid, listId: listId, continue: true };
        }
        const keys_item_optional_valid = keys_item_exist.filter(key =>
            keys_optional_pattern.some(pattern => pattern.test(key)) &&
            Object.keys(keys_necessary).indexOf(key) === -1
        )
        // return {speakout:`<speak>その後、改めてこのスキルを呼び出してください。</speak>`};

        // return {keys:keys_item_exist, dict:dict_item_exist, key2:keys_item_invalid};
        const keys_item_valid = Array.from(new Set([].concat(Object.keys(keys_necessary), keys_item_optional_valid)));
        // return keys_item_valid;
        const info_dict = Object.assign(...Object.entries(dict_item_exist
        ).filter(([k, _v]) => keys_item_valid.indexOf(k) !== -1
        ).map(([k, v]) => Object({ [k]: v }))
        );
        return { speakout: `情報を登録しました`, ok: true, status: "valid items", info_dict: info_dict, continue: true };
    }

    const res_lists = await fetch(url, { method: "GET", headers: headers })
        .then(d => d.json());
    const judge_list = await obtainInfo_fromList(res_lists);
    if (judge_list.continue === false) {
        return judge_list;
    }
    if (judge_list.status === "lack of items") {
        for (const key of judge_list.keys_item_invalid) {
            await fetch(url + `${judge_list.listId}/items`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ value: `LINE_Check_${key}: ${keys_necessary[key]}`, status: "active" })
            })
        }
        return judge_list;
    }
    // save info
    const attributesManager = handlerInput.attributesManager;
    attributesManager.setPersistentAttributes({ info_dict: JSON.stringify(judge_list.info_dict) });
    await attributesManager.savePersistentAttributes();
    return judge_list;

}


const getInfo = async (handlerInput) => {
    const attributesManager = handlerInput.attributesManager;
    const info_dict = await attributesManager.getPersistentAttributes(
    ).then(items => Object.assign({ info_dict: JSON.stringify({}) }, items || {})
    ).then(items => Object.assign({}, JSON.parse(items.info_dict)));
    if (Object.keys(keys_necessary).some(d => Object.keys(info_dict).indexOf(d) === -1 ||
        info_dict[d].length === 0)) {
        const speakout = ``;
        return { ok: false, continue: true, status: "start setInfo", speakout: speakout }
    }
    return { ok: true, info_dict: info_dict, continue: true, speakout: null, status: `valid info_dict` };
}

const fetchCustom = async (handlerInput, params = []) => {
    const res_getInfo = await getInfo(handlerInput);
    if (res_getInfo.ok === false) {
        if (res_getInfo.status === "start setInfo") {
            return await setInfo(handlerInput);
        }
    }
    const info_dict = res_getInfo.info_dict;
    const headers = Object.assign(...Object.entries(info_dict
    ).filter(([k, v]) => /^Header_\S+/.test(k) && v.length > 0
    ).map(([k, v]) => Object({ [k.replace(/^Header_/, "")]: v })));

    const url_now = info_dict.URL_Request + (params.length === 0 ? "" : "?" + params.join("&"));
    // return {url:url_now, method:info_dict.Method_Request, headers:headers}    
    const res = await fetch(url_now, {
        method: "GET",
        headers: headers
    }).then(d => d.json());
    if (params.indexOf("command=obtainMessages") === -1) {
        return {
            ok: true,
            continue: true,
            status: `fetch succeeded`,
            speakout: null
        }
    }
    return {
        ok: true,
        continue: true,
        status: `succeeded obtaining messages`,
        speakout: null,
        hash: res.hash,
        // info:info_dict,
        // res:res,
        messages: res[Keys_Request.Key_LineMessages
        ].map(d => {
            if (Object.keys(d).indexOf(Keys_Request.Key_LineMessageContent) === -1 ||
                d[Keys_Request.Key_LineMessageContent].length === 0) return null;
            return {
                content: d[Keys_Request.Key_LineMessageContent],
                timestamp: Object.keys(d).indexOf(Keys_Request.Key_LineMessageTimestamp) === -1 ?
                    0 : // Date.now() :
                    d[Keys_Request.Key_LineMessageTimestamp]
            };
        }).filter(d => d !== null)
    };
}

// # check message

const checkFunc = async (handlerInput, mode = "manu") => {
    let res_fetch = {};
    try {
        res_fetch = await fetchCustom(handlerInput, ["command=obtainMessages"]);
        if (res_fetch.continue === false) {
            return handlerInput.responseBuilder.speak(res_fetch.speakout)
                .getResponse();

        }
        const messagesTmp = res_fetch.messages;
        messages = Array.isArray(messagesTmp) ? messagesTmp : [];
        hash = res_fetch.hash;
    } catch (error) {
        messages = [];
    }
    const messages_length = messages.length;
    if (messages_length === 0) {
        const IsRegular = mode === "auto";
        const speakOutput = (IsRegular) ? "" : `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE </phoneme>にメッセージはありません。</speak>`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    } else {
        const speakOutput = `<speak><phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE </phoneme>に${messages.length}件のメッセージがあります。</speak>`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("")
            .getResponse();
    }
}

const CheckIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'CheckIntent';
    },
    async handle(handlerInput) {
        const mode_in = Alexa.getSlotValue(handlerInput.requestEnvelope, "mode");
        const mode_dic = { "自動": "auto", "手動": "manu" };
        const mode = Object.keys(mode_dic).indexOf(mode_in) !== -1 ? mode_dic[mode_in] : "manu";
        return checkFunc(handlerInput, mode);
    }
};

const RegisterIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'RegisterIntent';
    },
    async handle(handlerInput) {
        const res_setInfo = await setInfo(handlerInput);
        return handlerInput.responseBuilder.speak(res_setInfo.speakout)
            .getResponse();
    }
};

// # Yes

const YesIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        // return handlerInput.responseBuilder.speak(`<speak>${intent_before}</speak>`)
        //     .getResponse();
        if (intent_before === "check to read" && messages.length > 0) {
            intent_before = null;
            return await ReadIntentHandler.handle(handlerInput);
        } else if (intent_before === "check to set info") {
            intent_before = null;
            const res_setInfo = await setInfo(handlerInput, false);
            return handlerInput.responseBuilder.speak(res_setInfo.speakout)
                .getResponse();
        }
        return handlerInput.responseBuilder.speak(`<speak>エラーが発生しました。はじめからやり直してください。</speak>`)
            .getResponse();
    }
};

// # read
const ReadIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'ReadIntent';
    },
    async handle(handlerInput) {
        const speech_main = messages.map((message, ind) => {
            const text = message.content;
            if (message.timestamp === 0 || message.timestamp === "0" || message.timestamp === undefined) {
                return `${text}`;
            }
            const time = new Date(message.timestamp);
            const hour = (time.getHours()) % 24;
            const min = time.getMinutes();
            return `${ind + 1}件目。${hour}時${min}分。${text}`;
        }).join("...");
        messages = [];
        try {
            fetchCustom(handlerInput, ["command=succeed", `hash=${hash}`]);
        } catch (e) {
            console.log(e);
        }
        const speakOutput = `<speak>${speech_main}</speak>`;
        return await handlerInput.responseBuilder.speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
};


const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        const speakOutput = '<speak>「<phoneme alphabet="x-amazon-pron-kana" ph="ライン">LINE </phoneme>を確認」と言ってください</speak>';

        return await handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    async handle(handlerInput) {
        const speakOutput = '<speak>さようなら。</speak>';

        return await handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    async handle(handlerInput) {
        const speakOutput = 'すみません、よく分かりません。';

        return await handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    async handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return await handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    async handle(handlerInput, error) {
        const speakOutput = '';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return await handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        CheckIntentHandler,
        ReadIntentHandler,
        RegisterIntentHandler,
        YesIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({ apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION })
        })
    ).lambda();