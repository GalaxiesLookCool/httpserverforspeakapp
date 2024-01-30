const express = require("express");
const app = express();
app.use(express.urlencoded({extended : true}))
const port = 3002;

const net = require('node:net');
const HOST = "192.168.1.99"
const HOST_PORT = 8969
let currentlyReading = false
let sizeLeft;
let currentMsg;
let seqRecv;

const client = new net.Socket();
client.connect(HOST_PORT, HOST, function() {
    console.log("socket connected");
    //client.write("i am connected");
})
client.on('data', function(data) {
    recvDataFunc(data)
});
client.on('error', (err) => {
    console.log(err)
    process.exit(1)
})

global.listToCall = {
    0: handleBrdcstMsgs
}

app.get("/", function(req, res) {
    console.log("got req!")
    //console.log(req)
    console.log(req.originalUrl)
    res.send("Hello There outside World!");
});

app.get("/groups", async function(req, res) {
    //console.log(req.query)
    //console.log(req.originalUrl)
    let result = await getGroups(req.get('Email'), req.get('Password'))
    console.log("got groups")
    //console.log(result)
    res.send(result)
})

app.get("/login", async function (req, res){
    console.log("got login query")
    //console.log("got login")
    //console.log(req.originalUrl)
    console.log(req.originalUrl)
    //console.log(req.originalUrl)
    let result = await doLogin(req.get('Email'), req.get('Password'))
    console.log(result)
    res.send(result)
})

app.get("/id", async function (req, res) {
    console.log("got id query")
    let result = await getIdFromLogin(req.get('Email'), req.get('Password'))
    res.send(result.toString())
})

app.get("/msgs", async function (req, response) {
    console.log("got msgs query")
    let result = await getMsgs(req.query.groupID, req.query.lowerbound, req.query.upperbound, req.get('Email'), req.get('Password'))
    response.send(result)
})

app.get("/user", async function (req, res) {
    console.log("got user query")
    let result = await getUser(req.query.userid)
    res.send(result)
})

app.post("/msgstext", async function (req, res) {
    console.log(req.body)
    console.log("got msg post")
    await sendNewMessageText(req.get('Email'), req.get('Password'), req.body.chat_id, req.body.text_content)
    res.send()
})

async function sendNewMessageText(em, pass, chatid, text_content){
    let tok = await doLogin(em, pass)
    let messageFormat = JSON.stringify({"type" : "create", "create-args" : {"type" : "msg" , "group_id" : chatid, "token" : tok, "msg_content" : text_content}})
    let res = await sendMessageAsync(messageFormat)
    console.log(res)
    return

}

async function getUser(uid){
    console.log(`getting user - ${uid}`)
    let messageFormat = JSON.stringify({"type" : "fetch", "fetch-args" : {"type" : "user", "target_id" : uid}})
    let resp = await sendMessageAsync(messageFormat)
    //console.log(resp)
    return JSON.parse(resp)["fetch-data"]
}

async function doLogin(email, password){
    //console.log(`doing login - ${email} : ${password}`)
    let loginFormat = JSON.stringify({"type" : "login", "login-args" : {"email" : email, "password" : password}})
    let tok = JSON.parse(await sendMessageAsync(loginFormat))
    if (tok.success == "0")
        return "invalid email or password"
    return tok["fetch-data"]["token"]
}

async function getIdFromLogin(email, password){
    console.log(`getting id from login - ${email} : ${password}`)
    let loginFormat = JSON.stringify({"type" : "login", "login-args" : {"email" : email, "password" : password}})
    let tok = JSON.parse(await sendMessageAsync(loginFormat))
    if (tok.success == "0")
        return "invalid email or password"
    return tok["fetch-data"]["id"]
}

async function getGroups(email, password) {
    //console.log(`getting groups for user - ${email} : ${password}`)
    let token = await doLogin(email, password)
    if (token.length != 20){
        return "invalid token"
    }
    let getGroupsFormat = JSON.stringify({"type" : "fetch", "fetch-args" : {"type" : "groups", "token" : token}})
    let result = await sendMessageAsync(getGroupsFormat)
    //console.log(JSON.parse(result))
    return JSON.parse(result)["fetch-data"]
}

async function getMsgs(groupid, lowerbound, upperbound, email, password){
    //console.log(`getting msgs  - ${email} : ${password}, group id is ${groupid}`)
    let token = await doLogin(email, password)
    if (token.length != 20)
        return "invalid token"
    let getMsgsFormat = JSON.stringify({"type" : "fetch", "fetch-args" : {"type" : "msgs", "token" : token, "upper_bound" : 0, "lower_bound" : 0, "target_group" : groupid}})
    let result = await sendMessageAsync(getMsgsFormat)
    //console.log(result)
    return JSON.parse(result)["fetch-data"]
}

doLogin("testv11@gmail.com", "pogPOG123!@#")



function sendMessageAsync(msg){
    let resolverr;
    let prom = new Promise((resolver, rejecetor) => {
        resolverr = resolver
    })
    sendAndReserve(msg, (data)=>{resolverr(data.toString())})
    return prom
}




app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});

function sendMsgSock(sock, msg, seq = 0) {
    //(`sending ${msg}`)
    if (typeof msg === 'string' || msg instanceof String) //msg is string - needs to be encoded
        msg = Buffer.from(msg, 'utf8')
    //console.log(msg)
    let buf = Buffer.allocUnsafe(4);
    buf.writeInt32BE(seq);
    //console.log("printing seq in binary")
    //console.log(buf)
    //console.log(buf.readInt32BE())
    msg = Buffer.concat([buf, msg])
    bufv2 = Buffer.allocUnsafe(4)
    bufv2.writeInt32BE(Buffer.byteLength(msg))
    msg = Buffer.concat([bufv2, msg])
    sock.write(msg)
}

function recvDataFunc(data) {
    if (currentlyReading == false) {
        size = data.slice(0, 4).readInt32BE()
        data = data.slice(4)
        seqRecv = data.slice(0, 4).readInt32BE()
        //console.log(`size is ${size} and seq is ${seqRecv}`)
        if (Buffer.byteLength(data) == size) // message is exactly the size - full content + seq (=size) + 4 (because of size). just need to call func now
        {
            //console.log(global.listToCall)
            let functorun = global.listToCall[seqRecv]
            //console.log(functorun)
            //console.log(`should call now ${seqRecv}`)
            functorun(data.slice(4)) //pass to function everything after the 4 bytes of seq and size
            if (seqRecv != 0)
                delete global.listToCall[seqRecv]
            //if (seqRecv != 0)
            //global.listToCall = arrayRemoveSeq(global.listToCall, seqRecv) 
        } else if (Buffer.byteLength(data) < size) //data is shorter than the full msg
        {
            currentMsg = data.slice(4)
            sizeLeft = size - Buffer.byteLength(data)
            currentlyReading = true
        } else if (Buffer.byteLength(data) > size) //data is BIGGER tahn needed
        {
            let functorun = global.listToCall[seqRecv]
            //console.log(functorun)
            functorun(data.slice(4, size))
            if (seqRecv != 0)
                delete global.listToCall[seqRecv]
            //objectInArr = global.listToCall.find(obj => obj.seq === seqRecv)
            //objectInArr.func(data.slice(4, size))
            //if (seqRecv != 0)
            //global.listToCall = arrayRemoveSeq(global.listToCall, seqRecv)
            recvDataFunc(data.slice(size))
        }
    } else { //currently reading is true
        size = Buffer.byteLength(data)
        if (size == sizeLeft) { //exactly the full message left
            //objectInArr = global.listToCall.find(obj => obj.seq === seqRecv)
            //objectInArr.func(Buffer.concat([currentMsg, data]))
            let functocall = global.listToCall[seqRecv]
            functocall(Buffer.concat([currentMsg, data]))
            if (seqRecv != 0)
                delete global.listToCall[seqRecv]
            currentlyReading = false
        } else if (size < sizeLeft) //still isnt full message
        {
            currentMsg = Buffer.concat([currentMsg, data])
            sizeLeft = sizeLeft - size
        } else if (size > sizeLeft) //more than the full message
        {
            currentMsg = Buffer.concat([currentMsg, data.slice(0, sizeLeft)])
            //console.log(global.listToCall)
            let functocall = global.listToCall[seqRecv]
            functocall(currentMsg)
            if (seqRecv != 0)
                delete global.listToCall[seqRecv]
            //objectInArr = global.listToCall.find(obj => obj.seq === seqRecv)
            //objectInArr.func(currentMsg)
            //if (seqRecv != 0)
            //global.listToCall = arrayRemoveSeq(global.listToCall, seqRecv)
            currentlyReading = false
            recvDataFunc(data.slice(sizeLeft))
        }
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}


function getSeq() {
    num = getRandomInt(10000)
    //console.log(`first num is ${num}`)
    while (global.listToCall.hasOwnProperty(num)) {
        num = getRandomInt(10000)
    }
    //console.log(`num returned is ${num}`)
    return num
}

function handleBrdcstMsgs(data) {
    return
}


function sendAndGetPromise(msg) {
    var seqNum = getSeq()
    var resolver;
    var prom = new Promise((resolve, reject) => {
        resolver = resolve
    })
    global.listToCall.push({
        seq: seqNum,
        func: function(data) {
            resolver(data);
        }
    })
    sendMsgSock(client, msg, seqNum)
    return prom
}

function sendNORESP(msg) {
    seqNum = 0
    sendMsgSock(client, msg, seqNum)
}


function sendAndReserve(msg, handler) {
    seqNum = getSeq()
    //console.log(`seq is ${seqNum}`)
    global.listToCall[seqNum] = handler
    //global.listToCall.push({seq: seqNum, func: function(data){
    //handler(data);
    //}})
    //console.log(global.listToCall)
    sendMsgSock(client, msg, seqNum)
}