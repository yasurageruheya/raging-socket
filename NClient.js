

class NClient
{
	constructor(socket)
	{
		this.cpuLength = 0;
		this.cpuIdles = [];
		this.runningCpuProcesses = 0;
		this.haveModules = [];
		this.gpuLength = 0;
		this.runningGpuProcesses = 0;
		this.socket = socket;
	}

	get runningProcesses() { return this.runningCpuProcesses + this.runningGpuProcesses; }
}

module.exports = NClient;