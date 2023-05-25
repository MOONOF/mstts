var express = require("express");
var fs = require("fs");
var app = express();
app.use(express.static("public"));
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
const schedule = require("node-schedule");
var art = require("express-art-template");
app.engine("html", art);
app.listen(5000, function () {
  console.log("已启动服务器，请访问5000端口");
});

const qiniu = require("qiniu"); // 引入七牛云的SDK
var accessKey = "vdbCOA5B4yfRMuAnp6n45kQgvlu6S81UwVWNK-1v";
var secretKey = "bSsCRku7Rs_WU8mIl8TuscEkg92YZG5ORlw9V1fg";
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var bucket = "my-chat";
var options = {
  scope: bucket,
};
var putPolicy = new qiniu.rs.PutPolicy(options); // 配置
var uploadToken = putPolicy.uploadToken(mac);

var config = new qiniu.conf.Config();
// 空间对应的机房
config.zone = qiniu.zone.Zone_z2;

var formUploader = new qiniu.form_up.FormUploader(config); // formUploader.putFile方法上传文件
// 第一个属性为上传凭证
// 第二个属性为上传文件要以什么命名  null 则随机命名
// 第三个为文件的相对地址， 相对为当前执行文件的地址
// 第四个属性putExtra， 应该是额外需要的参数，用new qiniu.form_up.PutExtra()获取
// 第五个为回调函数，respErr失败内容  respBody主体内容  respInfo信息内容
var putExtra = new qiniu.form_up.PutExtra();
var bucketManager = new qiniu.rs.BucketManager(mac, config);

let rule = new schedule.RecurrenceRule();
// rule.second = 0; //每分钟的0秒执行
rule.dayOfWeek = [1, 2, 3, 4, 5, 6];
let job = schedule.scheduleJob(rule, () => {
  let options = {};
  bucketManager.listPrefix(bucket, options, function (err, respBody, respInfo) {
    if (err) {
      console.log(err);
      throw err;
    }
    if (respInfo.statusCode == 200) {
      var items = respBody.items;
      let statOperations = [];
      items.forEach(function (item) {
        statOperations.push(qiniu.rs.statOp("my-chat", item.key));
      });
      bucketManager.batch(statOperations, function (err, respBody, respInfo) {
        if (err) {
          console.log(err);
          //throw err;
        } else {
          console.log("清除成功");
        }
      });
    } else {
      console.log(respBody);
    }
  });
});
app.get("/mstts", function (req, res) {
  let hashUrL = "";
  let text = req.query.text;
  console.log("text", text);
  // pull in the required packages.
  var sdk = require("microsoft-cognitiveservices-speech-sdk");
  var readline = require("readline");

  // replace with your own subscription key,
  // service region (e.g., "westus"), and
  // the name of the file you save the synthesized audio.
  var subscriptionKey = "ca1dd1d503e6465791d1e13d507dd546";
  var serviceRegion = "eastasia"; // e.g., "westus"
  var filename = "demo.wav";

  // we are done with the setup

  // now create the audio-config pointing to our stream and
  // the speech config specifying the language.
  var audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename);
  var speechConfig = sdk.SpeechConfig.fromSubscription(
    subscriptionKey,
    serviceRegion
  );

  // create the speech synthesizer.
  var synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  synthesizer.speakTextAsync(
    text,
    async function (result) {
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        console.log(result.audioData);
        const name = "demo.wav";
        // var rs = fs.createReadStream(__dirname + "/" + name); // 设置响应请求头，200表示成功的状态码，headers表示设置的请求头
        updataToQI(res);
      } else {
        console.error(
          "Speech synthesis canceled, " +
            result.errorDetails +
            "\nDid you update the subscription info?"
        );
      }
      synthesizer.close();
      synthesizer = undefined;
    },
    function (err) {
      console.trace("err - " + err);
      synthesizer.close();
      synthesizer = undefined;
    }
  );
  console.log("Now synthesizing to: " + filename);
});

async function updataToQI(res) {
  await formUploader.putFile(
    uploadToken,
    null,
    "./demo.wav",
    putExtra,
    function (respErr, respBody, respInfo) {
      if (respErr) {
        throw respErr;
      }
      if (respInfo.statusCode == 200) {
        console.log(respBody);
        hashUrL = respBody.key;
        res.json({
          code: 200,
          Url: "http://rv7c48g89.hn-bkt.clouddn.com/" + hashUrL,
        });
      }
    }
  );
}
