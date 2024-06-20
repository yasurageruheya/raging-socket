/** @type {Object.<ToClientResponse>} */
const instances = [];

class ToClientResponse
{
	static getInstance(taskId, toClientSocket)
	{
		if(typeof instances[taskId] === "undefined") instances[taskId] = new ToClientResponse(taskId, toClientSocket);
		return instances[taskId];
	}

	/**
	 *
	 * @param {string} taskId
	 * @param {ToClientSocket} toClientSocket
	 */
	constructor(taskId, toClientSocket)
	{
		/** @type {string} */
		this.taskId = taskId;

		/** @type {ToClientSocket} */
		this.toClientSocket = toClientSocket;

		instances.push(this);
	}

	/**
	 *
	 * @param {*} data
	 * @return {Promise<ToClientResponse>}
	 */
	vars(data)
	{
		return this.toClientSocket.vars(this, data);
	}

	/**
	 *
	 * @param {Transferable} data
	 * @param {string} [dataName=""]
	 * @return {Promise<ToClientResponse>}
	 */
	transfer(data, dataName="")
	{
		return this.toClientSocket.transfer(this, data, dataName);
	}

	/**
	 *
	 * @return {Promise<FromClientProcessing|Error>}
	 */
	start()
	{
		return this.toClientSocket.start(this);
	}

}

module.exports = ToClientResponse;