const ipToInt = require("ip-to-int");
const {io, connect} = require("socket.io-client");
const os = require("os");
const path = require("path");
const systemInformation = require("systeminformation");
const NClient = require("./NClient");
const {performance} = require("perf_hooks");
const {EventEmitter} = require("events");

const toServerSocketOptions = {};
toServerSocketOptions.reconnection = false;

const S2C_CLAIM_STATUS = "serverToClientClaimStatus";
const C2S_RESPONSE_STATUS = "clientToServerResponseStatus";

class NetworkWorker extends EventEmitter
{
	static socketPort = 30001;
	static toServerSocketOptions = toServerSocketOptions;

	static NEW_CLIENT = "newClient";

	constructor(startAddress, endAddress)
	{
		super();
		this.start = ipToInt(startAddress).toInt();
		this.end = ipToInt(endAddress).toInt();

		this.servers = {};
		this.clients = {};

		this.status = new NClient();
		this.status.cpuLength = os.cpus().length;
	}

	initialize(serverSocket=null)
	{
		return new Promise(resolve =>
		{
			systemInformation.graphics().then(data=>
			{
				for(let i=0; i<data.controllers.length; i++)
				{
					const model = data.controllers[i].model.toLowerCase();
					if(model.includes("geforce") || model.includes("radeon"))
					{
						this.status.gpuLength++;
					}
				}

				if(!serverSocket)
				{
					const {Server} = require("socket.io");
					serverSocket = new Server();
					/** @type {Server} */
					this.serverSocket = serverSocket;
				}

				serverSocket.on("connection", (clientSocket)=>
				{
					console.log(clientSocket.handshake);
					const address = clientSocket.handshake.address;
					this.clients[address] = new NClient(clientSocket);
					if(typeof this.servers[address] === "undefined") this.connectToServer(address);
					clientSocket.on(C2S_RESPONSE_STATUS, (status)=>
					{
						status.socket = clientSocket;
						this.clients[address] = status;
					})
					clientSocket.emit(S2C_CLAIM_STATUS);
				});

				this.searchPartner();
				resolve(this);
			})
		})
	}

	searchPartner()
	{
		const end = this.end;
		for(let i=this.start; i<=end; i++)
		{
			this.connectToServer(ipToInt(i).toIP());
		}
	}

	connectToServer(address)
	{
		const toServerSocket = io("ws://" + address + ":" + NetworkWorker.socketPort, NetworkWorker.toServerSocketOptions);
		this.servers[address] = toServerSocket;
		toServerSocket.io.on("reconnect_failed", ()=>
		{
			toServerSocket.off();
			toServerSocket.io.off();
			delete this.servers[address];
		});
		toServerSocket.on(S2C_CLAIM_STATUS, ()=>
		{
			this.cpuIdleCheck();
			const cloneStatus = JSON.parse(JSON.stringify(this.status));
			delete cloneStatus.socket;
			toServerSocket.emit(C2S_RESPONSE_STATUS, cloneStatus);
		});
	}

	cpuIdleCheck()
	{
		const cpus = os.cpus();
		const cpuIdles = [];
		for(let cpu of cpus)
		{
			let oneTotal = 0;
			for(const type in cpu.times)
			{
				oneTotal += cpu.times[type];
			}
			cpuIdles.push(cpu.times.idle / oneTotal);
		}

		this.status.cpuIdles = cpuIdles;
	}
}

module.exports = NetworkWorker;