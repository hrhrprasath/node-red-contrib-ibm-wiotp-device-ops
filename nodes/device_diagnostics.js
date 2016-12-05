/**
 * Copyright 2014, 2015, 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var cfEnv = require("cfenv");
    var IBMIoTF = require('ibmiotf');

    var appClient;

    //support for multiple orgs
    var wiot_services  = cfEnv.getAppEnv().services['iotf-service'];

    var wiotp_creds = {};

    function connectBluemix() {
      if (wiot_services) {
        // TODO: remove this when we need to support multiple orgs
        var serviceCreds = wiot_services[0];

        wiotp_creds = {
          org: serviceCreds.credentials.org,
          id: Date.now().toString(),
          "auth-key": serviceCreds.credentials.apiKey,
          "auth-token": serviceCreds.credentials.apiToken
          };
        appClient = new IBMIoTF.IotfApplication(wiotp_creds);

      }
    }

    function connectApiKey(creds) {

        wiotp_creds = {
          org: creds.user.split('-')[1],
          id: Date.now().toString(),
          "auth-key": creds.user,
          "auth-token": creds.password
          };
        appClient = new IBMIoTF.IotfApplication(wiotp_creds);

    }
    //initialize with Bluemix service
    connectBluemix();

    RED.httpAdmin.get('/watsoniot/devicediagnostics/orgid', function(req,res) {
        res.send(JSON.stringify(wiotp_creds.org));
    });

    RED.httpAdmin.get('/watsoniot/devicediagnostics/getbluemixtypes', function(req,res) {

        connectBluemix();
        res.send('success');
    });

    RED.httpAdmin.get('/watsoniot/devicediagnostics/gettypes', function(req,res) {

      if(appClient) {
        appClient.getAllDeviceTypes().then (function onSuccess (response) {
              res.send(response);
          }, function onError (error) {
              res.status(403).send("No device types");
        });
      } else {
        res.status(401).send('Uninitialized Error');
      }
    });

    RED.httpAdmin.post('/watsoniot/devicediagnostics/newapikey', function(req,res) {

      if(req.body.credentials && req.body.credentials.user && req.body.credentials.password) {
        connectApiKey(req.body.credentials);
      } else {
        var deviceNode = RED.nodes.getNode(req.body.id);
        connectApiKey(deviceNode.credentials);
      }

      res.status(201).send('success');
    });


    function DeviceDiagnosticsHandler(config) {
        RED.nodes.createNode(this,config);
        this.parameters = config.parameters || [];
        var authSelected = config.auth;

        if(authSelected === 'bluemix') {
          connectBluemix();
        } else if(authSelected === 'api'){
          var deviceNode = RED.nodes.getNode(config.apiKey);

          connectApiKey(deviceNode.credentials);
        }
        var node = this;

        this.on('input', function(msg) {

          // Functions for success and failure for rest calls.
          var clearStatus = function(){
            setTimeout( function(){
              node.status({});
            },2000);
          }

          var onSuccess = function(argument) {
                  var msg = {
                    payload : argument
                  }
                  node.send(msg);
                  node.status({fill:"green",shape:"dot",text:"Sucess"});
                  clearStatus();
          };

          var onError =  function(argument) {
                  var msg = {
                    payload : argument
                  }
                  node.send(msg);

                  node.status({fill:"red",shape:"dot",text:"Error. Refer to debug tab"});
          };


          node.status({fill:"blue",shape:"dot",text:"Requesting"});

          //pass the operation name in msg
          var operation = msg.operation ? msg.operation : config.method;
		      var operation_lowercase=operation.toLowerCase();
          //rest all values from msg.payload
          //try to parse the payload if its string
          if( typeof msg.payload === 'string') {
            try {
              msg.payload = JSON.parse(msg.payload);
            } catch( exception) {

            }
          }

          // take the values from config, if not get it from msg.
          var deviceType = config.deviceType ? config.deviceType : msg.payload.deviceType;
          var deviceId = config.deviceId ? config.deviceId : msg.payload.deviceId;
          var logId = config.logId ? config.logId : msg.payload.logId;
          var log = msg.payload.log;
          var errorCode = msg.payload.errorCode;
          var parameters =  config.parameters ? config.parameters : msg.payload.parameters;// ||[];//[{"value": "0.2.3","name": "NewVersion" }];
        //  var devices = config.deviceType && config.deviceId ? [{ "typeId": config.deviceType, "deviceId": config.deviceId }] : msg.payload.deviceList ;

          //Validations
          if(!deviceType ){
            node.error("DeviceType must be set for "+operation+" operation. You can either set in the configuration or must be passed as msg.payload.deviceType");
            clearStatus();
            return;
          }
          if(!deviceId ){
            node.error("Device Id must be set for "+operation+" operation. You can either set in the configuration or must be passed as msg.payload.deviceId");
            clearStatus();
            return;
          }
          if((operation_lowercase === "delete_log" || operation_lowercase === "get_log" )&& !logId){
              node.error("Log Id must be set for "+operation+" operation. You can either set in the configuration or must be passed as msg.payload.logId");
              clearStatus();
              return;
          }

          //Operations
          switch (operation_lowercase) {
                case "get_all_log":
                  appClient.getAllDiagnosticLogs(deviceType,deviceId).then(onSuccess,onError);
                  break;
                case "new_log":
                console.log("dt"+deviceType);
                console.log("id"+ deviceId);
                console.log("log"+ log);
                  appClient.addDeviceDiagLogs(deviceType,deviceId,log).then(onSuccess,onError);
                  break;
                case "get_log":
                  appClient.getDiagnosticLog(deviceType,deviceId,logId).then(onSuccess,onError);
                  break;
                case "delete_log":
                console.log("dt"+deviceType);
                console.log("id"+ deviceId);
                console.log("log id"+ logId);
                  appClient.deleteDiagnosticLog(deviceType,deviceId,logId).then(onSuccess,onError);
                  break;
                case "delete_all_logs":
                  appClient.clearAllDiagnosticLogs(deviceType,deviceId).then(onSuccess,onError);
                  break;
                case "new_err":
                  appClient.addErrorCode(deviceType,deviceId,errorCode).then(onSuccess,onError);
                  break;
                case "get_all_err":
                  appClient.getDeviceErrorCodes(deviceType,deviceId).then(onSuccess,onError);
                  break;
                case "delete_all_err":
                  appClient.clearDeviceErrorCodes(deviceType,deviceId).then(onSuccess,onError);
                  break;
          }
        });
    }



	RED.nodes.registerType("device-diagnostics",DeviceDiagnosticsHandler);


}
