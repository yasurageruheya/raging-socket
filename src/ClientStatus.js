
/** @type {Object.<ToClientSocket>} */
const clientSockets = {};

/**
 *
 * @param {number[]} cpuIdles
 * @return {number}
 */
let countCpuIdleThreshold = (cpuIdles)=>
{
	let counter = 0;
	const length = cpuIdles.length;
	for(let i=0; i<length; i++)
	{
		if(cpuIdles[i] < .5) ++counter
	}
	return --counter;
};

//todo: ClientStatus が持つ各種メソッドは ToClientSocket が持つべきではないか。サーバー側しか clients を持つ必要は無いのだし。

class ClientStatus
{
	/**
	 *
	 * @return {function(number[]): number}
	 */
	static get countCpuIdleThreshold() { return countCpuIdleThreshold; }

	static setCheckCpuIdleThreshold(func)
	{
		countCpuIdleThreshold = func;
	}

	static get allClientSockets() { return clientSockets; }

	/**
	 *
	 * @param {ToClientSocket} [toClientSocket]
	 */
	constructor(toClientSocket=null)
	{
		/**
		 * 0～1までの数値が入った配列。 1ならCPU使用率が 100％のコアだという事
		 * @type {number[]}
		 */
		this.cpuIdles = [];
		this.cpuIdleThresholdCounted = false;

		/**
		 * @private
		 * @type {number}
		 */
		this._idleCpuLength = 0;

		this.runningCpuProcesses = 0;
		/** @type {Object.<dependency>} */
		this.packages = {};
		this.sourcecodes = {};
		this.gpuLength = 0;
		this.runningGpuProcesses = 0;

		this.toClientSocket = toClientSocket;
	}

	get idleCpuLength()
	{
		if (!this.cpuIdleThresholdCounted) {
			this._idleCpuLength = countCpuIdleThreshold(this.cpuIdles);
			this.cpuIdleThresholdCounted = true;
		}
		return this._idleCpuLength - this.runningCpuProcesses;
	}


	get idleGpuLength()
	{
		return this.gpuLength - this.runningGpuProcesses;
	}

	/**
	 *
	 * @param {RequestTask} task
	 */
	delegateTask(task)
	{
		this.toClientSocket.requests.push(task);
		task.statusUpdate();
		if(task.processType === "cpu") this.runningCpuProcesses++;
		else this.runningGpuProcesses++;
	}

	get runningProcesses() { return this.runningCpuProcesses + this.runningGpuProcesses; }
}

module.exports = ClientStatus;