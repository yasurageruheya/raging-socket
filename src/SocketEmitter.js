const SocketMessage = require("./SocketMessage");
const logOptions = require("./RagingSocketOptions").logOptions;

const messages = {};
for(const key in SocketMessage)
{
	messages[SocketMessage[key]] = key;
}

class SocketEmitter
{
	constructor(ipAddress)
	{
		/** @type {Socket} */
		this.socket = null;

		/** @type {string} */
		this.ipAddress = ipAddress;
	}

	on(messageCode, func)
	{
		this.socket.on(messageCode, (...args)=>
		{
			//todo: S2C_TASK_SUPPLEMENTATION の時、各 report の SocketMessage の内容を出さなきゃ！！！！
			if(logOptions.connectionInfo)
			{
				reformatLog(this, messageCode, ", << FROM", ...args);
				// const reports = (()=>
				// {
				// 	if(Array.isArray(args)) return Object.assign({}, args[0]);
				// 	return args;
				// })();
				// switch (messageCode)
				// {
				// 	case SocketMessage.S2C_TASK_SUPPLEMENTATION:
				// 	case SocketMessage.C2S_REPORT_TASKS_STATUS:
				// 		for(const key in reports)
				// 		{
				// 			const rpt = reports[key];
				// 			rpt.status = messages[rpt.status] || rpt.status;
				// 		}
				// 		break;
				// }
				//
				// messageCode = messages[messageCode] || messageCode;
				// console.log(messageCode + ", << FROM", this.ipAddress, reports);
			}
			func(...args);
		})
	}

	once(messageCode, func)
	{
		this.socket.once(messageCode, (...args)=>
		{
			if(logOptions.connectionInfo)
			{
				reformatLog(this, messageCode, ", << FROM", ...args);
				// messageCode = messages[messageCode] || messageCode;
				// console.log(messageCode + ", << FROM", this.ipAddress, ...args);
			}
			func(...args);
		})
	}

	emit(messageCode, ...args)
	{
		if(logOptions.connectionInfo)
		{
			reformatLog(this, messageCode, ", TO >>", ...args);
		}
		this.socket.emit(messageCode, ...args);
	}

	off(eventName, listener)
	{
		this.socket.off(eventName, listener)
	}
}

const reformatLog = (emitter, messageCode, dest, ...args)=>
{
	const reports = (()=>
	{
		if(messageCode === SocketMessage.S2C_SEND_VARS)
		{
			return Object.assign(args);
		}
		else if(messageCode === SocketMessage.S2C_SEND_TRANSFER_DATA)
		{
			const rpt = {};
			rpt[args[0]] = {bufferName: args[2], arrayBuffer: args[1]};
			return rpt;
		}
		else if(Array.isArray(args))
		{
			if(args.length === 1)
			{
				if(typeof args[0] === "string") return args[0];
				else if(args[0] instanceof Buffer || args[0] instanceof ArrayBuffer)
				{
					return typeof args[0] + "{bytesLength: "+ Buffer.byteLength(args[0]) +"}";
				}
			}
			return Object.assign({}, args[0]);
		}
		return args;
	})();
	switch (messageCode)
	{
		case SocketMessage.S2C_TASK_SUPPLEMENTATION:
		case SocketMessage.C2S_REPORT_TASKS_STATUS:
			for(const key in reports)
			{
				const rpt = Object.assign({}, reports[key]);
				rpt.status = messages[rpt.status] || rpt.status;
				reports[key] = rpt;
			}
			break;
	}
	messageCode = messages[messageCode] || messageCode;

	console.log(messageCode + dest, emitter.ipAddress, reports);
}


module.exports = SocketEmitter;