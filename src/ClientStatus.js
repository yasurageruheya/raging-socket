
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
		if(cpuIdles[i] > .5) ++counter
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

		/** @type {string[]} */
		this.runningCpuProcesses = [];
		/** @type {string[]} */
		this.runningGpuProcesses = [];
		/** @type {Object.<dependency>} */
		this.packages = {};
		this.gpuLength = 0;

		this.canClaimStatusReport = true;
		this.toClientSocket = toClientSocket;
	}

	/** @return {string[]} */
	get cpuTasks()
	{
		return this.#getTasks("cpu");
	}

	/** @return {string[]} */
	get gpuTasks()
	{
		return this.#getTasks("gpu");
	}

	/**
	 *
	 * @param {"cpu"|"gpu"} processType
	 * @return {string[]}
	 */
	#getTasks(processType)
	{
		processType = processType.toLowerCase();
		let length;
		const tasks = [];
		if(this.toClientSocket)
		{
			const requests = this.toClientSocket[processType+"Requests"];
			length = requests.length;
			for(let i=0; i<length; i++)
			{
				tasks.push(requests[i].taskId);
			}
		}

		const processes = this["running"+processType.charAt(0).toUpperCase()+"puProcesses"];
		length = processes.length;
		for(let i=0; i<length; i++)
		{
			if(!tasks.includes(processes[i]))
				tasks.push(processes[i]);
		}

		return tasks;
	}

	get idleCpuLength()
	{
		if (!this.cpuIdleThresholdCounted) {
			this._idleCpuLength = countCpuIdleThreshold(this.cpuIdles);
			this.cpuIdleThresholdCounted = true;
		}
		return this._idleCpuLength - this.cpuTasks.length;
	}


	get idleGpuLength()
	{
		return this.gpuLength - this.gpuTasks.length;
	}

	/**
	 *
	 * @param {RequestTask} task
	 * @param {string} processType
	 */
	delegateTask(task, processType)
	{
		task.assignedProcessType = processType;

		const toClientSocket = this.toClientSocket;

		toClientSocket.requests.push(task);
		toClientSocket.reserveRequests.push(task);
		if(processType === "cpu") toClientSocket.cpuRequests.push(task);
		else toClientSocket.gpuRequests.push(task);
		task.socket = toClientSocket;

		task.statusUpdate();
	}

	get runningProcesses() { return [...this.runningCpuProcesses, ...this.runningGpuProcesses]; }
}

module.exports = ClientStatus;