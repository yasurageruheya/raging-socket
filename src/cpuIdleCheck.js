const os = require("os");

const prevTotals = [];
const prevIdles = [];

const cpus  = os.cpus();
const cpuLength = cpus.length;
for(let i=0; i<cpuLength; i++)
{
	const cpu = cpus[i];
	let oneTotal = 0;
	for(const type in cpu.times)
	{
		oneTotal += cpu.times[type];
	}
	prevTotals[i] = oneTotal;
	prevIdles[i] = cpu.times.idle;
}

const cpuIdleCheck = ()=>
{
	const cpus = os.cpus();
	/** @type {number[]} */
	const cpuIdles = [];
	for(let i=0; i<cpuLength; i++)
	{
		const cpu = cpus[i];
		let oneTotal = 0;
		for(const type in cpu.times)
		{
			oneTotal += cpu.times[type];
		}
		const idle = cpu.times.idle - prevIdles[i];
		const total = oneTotal - prevTotals[i];
		cpuIdles.push(idle / total);
		prevIdles[i] = cpu.times.idle;
		prevTotals[i] = oneTotal;
	}

	return cpuIdles;
}

/**
 *
 * @return {number[]}
 */
module.exports = cpuIdleCheck;