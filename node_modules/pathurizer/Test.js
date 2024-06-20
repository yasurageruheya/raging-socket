class Test
{
	static tests = [];

	static run()
	{
		const length = Test.tests.length;
		const results = [];
		for(let i=0; i<length; i++)
		{
			const result = Test.tests[i].run();
			if(result) results.push(result);
		}
		if(results.length) throw new Error("全テストの結果 " + results.length + " 個のテストエラーが出ました");
		else console.log(`全てのテスト（${length}個）が正常に完了しました`);
	}

	constructor(name, func, expected)
	{
		this.name = name;
		this.func = func;
		this.expected = expected;
		Test.tests.push(this);
	}

	run()
	{
		const result = JSON.stringify(this.func(), null, "\t");
		const expected = JSON.stringify(this.expected, null, "\t");
		if(result !== expected)
		{
			console.error(this.name + " のテストの結果、理想のデータと違う結果が出ました。\nテスト結果 : " + result + "\n\n理想の結果 : " + expected);
		}
	}
}

module.exports = Test;