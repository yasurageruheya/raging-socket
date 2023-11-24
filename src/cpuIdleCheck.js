const os = require("os");
/**
 *
 * @return {number[]}
 */
module.exports = ()=>
{
	const cpus = os.cpus();
	/** @type {number[]} */
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

	return cpuIdles;
}