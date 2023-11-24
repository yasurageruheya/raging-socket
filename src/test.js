let i = 0;
let count = 0;

const A = ()=>
{
	const n = i;
	console.log("A start", n);
	// console.log(await B(i++));
	// console.log("A complete", n);
	B(i++).then(count=>
	{
		console.log("A complete", n, count);
	})
}

const B = (n)=>
{
	console.log("B start", n);
	return promise.then((count)=>
	{
		console.log("B complete", n, count);
	});
}

const promise = new Promise((resolve)=>
{
	const loop = ()=>
	{
		count++;
		// console.log("count", count);
		if(count >= 10) resolve(count);
		else setTimeout(loop, 100);
	}
	loop();
})

setTimeout(A, (Math.random()*1000) >> 0);
setTimeout(A, (Math.random()*1000) >> 0);
setTimeout(A, (Math.random()*1000) >> 0);