/** @type {Object.<ToClientResponse>} */
const instances = [];

class ToClientResponse
{
	static getInstance(taskId, toClientSocket)
	{
		if(typeof instances[taskId] === "undefined") instances[taskId] = new ToClientResponse(taskId, toClientSocket);
		return instances[taskId];
	}

	constructor(taskId, toClientSocket)
	{
		this.taskId = taskId;
		this.socket = toClientSocket;
		instances.push(this);
	}

	vars(data)
	{

	}
}