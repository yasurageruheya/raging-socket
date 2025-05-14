const SocketMessage = {};
const fromValue = {};
const Decimalian = require('decimalian');

let connectionMessageNumber = new Decimalian(0);
SocketMessage.S2C_CONNECT_SUCCESS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_CONNECT_SUCCESS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_CLAIM_STATUS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_STATUS_REPORT = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_REQUEST_TASKS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_CONFIRM_TASKS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_REPORT_TASKS_STATUS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_UNACCEPTABLE_TASK = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_REQUEST_SOURCECODE = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_RESPONSE_SOURCECODE = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_SEND_WORKER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_TASK_SUPPLEMENTATION = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_STARTED = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_PROCESSING = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_PREPROCESS_ERROR = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_PROCESSING_ERROR = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_COMPLETE = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_TASK_COMPLETE_AND_AFTER_SEND_BUFFER = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_CLAIM_RESULT_BUFFER = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_RESULT_BUFFER_RECEIVED = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_RECEIVE_RESULT = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_TASK_CANCEL = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_WORKER_READY = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_SEND_TRANSFER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_SEND_SPLIT_BUFFER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_CLAIM_SPLIT_BUFFER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_RECEIVED_TRANSFER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_RECEIVED_ALL_SPLIT_BUFFER_DATA = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_SEND_VARS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.C2S_RECEIVED_VARS = connectionMessageNumber.addSelf(1).toString();
SocketMessage.S2C_TASK_START = connectionMessageNumber.addSelf(1).toString();
SocketMessage.CPU_LIMIT = connectionMessageNumber.addSelf(1).toString();
SocketMessage.GPU_LIMIT = connectionMessageNumber.addSelf(1).toString();
SocketMessage.CLIENT_STATUS_REPORT = connectionMessageNumber.addSelf(1).toString();

for(const key in SocketMessage)
{
	fromValue[SocketMessage[key]] = key;
}
SocketMessage.fromValue = (value)=>
{
	return fromValue[value];
}
module.exports = SocketMessage;