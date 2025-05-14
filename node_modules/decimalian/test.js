const Decimalian = require("./index");
let testCount = 0;
const errors = [];
const test = (name, a, b)=>
{
	testCount++;
	if(a !== b) errors.push(name + ", " + a + " !== " + b);
}

const a = Decimalian.fromString("Javascript");
test("a.bigInt", a.bigInt, 611462059528398043n);
test("a.toString()", a.toString(), "Javascript");
test("a.toString(16)", a.toString(16), "87c5980e3d1a4db");

/**
 * オリジナルの72進数を扱える Decimalian インスタンスを作ってみる
 * @type {string}
 */
const customDigits = " あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ";
test("customDigits.length", customDigits.length, 72);
/**
 * 第3引数 digits に customDigits を入れるとオリジナルの72進数の文字を使って toString() で文字列を書き出してくれる Decimalian インスタンスが作れます。
 * @type {Decimalian}
 */
const b = new Decimalian(0, 0, customDigits);
test("b.bigInt", b.bigInt, 0n);
test("b.toString()", b.toString(), " ");
b.bigInt++;
test("b.bigInt 1n", b.bigInt, 1n);
test("b.toString() あ", b.toString(), "あ"); //radix=(72) 引数 radix を省略すると radix は customDigits.length になります
b.bigInt++;
test("b.bigInt 2n", b.bigInt, 2n);
test("b.toString(0) い", b.toString(0), "い"); //"い" //radix=(72) 引数 radix に 0 を入れても radix は customDigits.length になります
b.bigInt += 2n;
test("b.bigInt 4n", b.bigInt, 4n);
test("b.toString(73) え", b.toString(73), "え"); //radix=(72) 引数 radix に customDigits.length より大きい数値を入れると自動で customDigits.length になります
b.bigInt += 5n;
test("b.bigInt 9n", b.bigInt, 9n);
test("b.toString(72) け", b.toString(72), "け"); //radix=72 引数 radix を省略しなければ 0.00001ミリ秒くらいは処理が早くなるのかも？
b.bigInt -= 1n;
test("b.bigInt 8n", b.bigInt, 8n);
test("b.toString() く", b.toString(), "く");
b.bigInt = 70n;
test("b.bigInt 70n", b.bigInt, 70n);
test("b.toString() ぺ", b.toString(), "ぺ");
b.bigInt = 71n;
test("b.bigInt 71n", b.bigInt, 71n);
test("b.toString() ぽ", b.toString(), "ぽ");
b.bigInt = 72n;
test("b.bigInt 72n", b.bigInt, 72n);
test("b.toString() あ ", b.toString(), "あ ");
b.bigInt = 73n; //b.bigInt: 73n
test("b.bigInt 73n", b.bigInt, 73n);
test("b.toString() ああ", b.toString(), "ああ");
b.bigInt *= 100000000000000000000000000000n; //b.bigInt: 7300000000000000000000000000000n
test("b.bigInt 7300000000000000000000000000000n", b.bigInt, 7300000000000000000000000000000n);
test("b.toString() すぽごかぞこみわぼだぱのゆがわねぶ", b.toString(), "すぽごかぞこみわぼだぱのゆがわねぶ"); //ふっかつのじゅもん みたいにできます

/**
 * SHA256 とかっていう 256bitハッシュもV8の BigInt なら 1ギガbit まで整数値を扱えるので、さらにそこから進数変換をしてみます。
 * new Decimalian() コンストラクタの第3引数を省略すると、Decimalian.digits クラスプロパティが参照されます。
 * Decimalian.digits の初期値は "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" という62進数用文字列です。
 * @type {Decimalian}
 */
const c = new Decimalian("5fd6975b5730a8dcd7c89c18659aa8852437762e2796447b7ecfce41969d386e", 16);
test("c.bigInt 43348870513508580009533891113746092838262721138945387876954984703710434506862n", c.bigInt, 43348870513508580009533891113746092838262721138945387876954984703710434506862n);
test("c.toString() mJ1vPoRP42uY40FAlM5ONtBQBB9t47Y9p8eAUdgMWDQ", c.toString(), "mJ1vPoRP42uY40FAlM5ONtBQBB9t47Y9p8eAUdgMWDQ"); //radix=(62) 62進数変換
test("c.toString(36) 2dzpjz3jxusvsp72qg28ogozz1xr4a8byqoiqz0uo24vzl0x2m", c.toString(36), "2dzpjz3jxusvsp72qg28ogozz1xr4a8byqoiqz0uo24vzl0x2m"); //radix=36 36進数変換

/**
 * 上のソースコードのSHA256 16進数文字列を62進数文字列へ変換する処理のショートハンド
 */
test('new Decimalian("5fd6975b5730a8dcd7c89c18659aa8852437762e2796447b7ecfce41969d386e", 16).toString()',
	new Decimalian("5fd6975b5730a8dcd7c89c18659aa8852437762e2796447b7ecfce41969d386e", 16).toString(),
	"mJ1vPoRP42uY40FAlM5ONtBQBB9t47Y9p8eAUdgMWDQ");

/**
 * 無駄に任意の n進数文字列を Decimalian インスタンスに足し算する機能もあります。
 * add メソッドではメソッドを使用したインスタンスの bigInt が加算されるのではなく、bigInt が加算された新しい Decimalian インスタンスが生まれます。
 * @type {Decimalian}
 */
const d = c.add("4caa264792f5f2759a3a7ed4244ddb05b4b5ef806cb4facb3f1d28430bbcec09", 16);
test("d.bigInt", d.bigInt, 78025275202843313626009594410545413521639766976747492178380147749524887708791n);

/**
 * 無駄に任意の n進数文字列を Decimalian インスタンスに引き算する機能もあります。
 */
const e = d.minus("1fc90ead1d945ffa0ea693c201290362a257956e4a6b39250ee225bd8b555b17", 16);
test("e.bigInt", e.bigInt, 63648339345106877495478678669320879521536092333185231856324620318113559529824n);

/**
 * 無駄に任意の n進数文字列を Decimalian インスタンスに掛け算する機能もあります。
 */
const f = e.multiply("e641019423b205f2bb40e4e160c5902c133701910ebf301ec2ce64cb766754b1", 16);
test("f.bigInt", f.bigInt, 6628771576445493686008595958475071159291719611689755994735250594179197913695883091984111499073963485029490975557088966101928677316548046822095347303758688n);

/**
 * 無駄に任意の n進数文字列を Decimalian インスタンスに割り算する機能もあります。BigIntなので、少数は出ないです。
 */
const g = f.division("2851758dd69d67f80c0f3df4c22d4627f61275c4ff2d0f6f372cbe48cdbc2e68", 16);
test("g.bigInt", g.bigInt, 363490441043500258655252039632737262480345486689571049442589930633629318701760n);

/**
 * 無駄に任意の n進数文字列を Decimalian インスタンスに余り算する機能もあります。
 */
const i = new Decimalian(13);
const j = i.remainder(5); //13n % 5 (remainder は余り算を意味する英単語らしいです) 余り算の結果を j という Decimal インスタンスに格納する
test("j.bigInt", j.bigInt, 3n);
const h = g.remainder("Javascript", 62); //363490441043500258655252039632737262480345486689571049442589930633629318701760n % 611462059528398043n
test("h.bigInt", h.bigInt, 608422645494768221n);

i.addSelf(1);
test("addSelf i.bigInt", i.bigInt, 14n);

i.minusSelf(10);
test("minusSelf i.bigInt", i.bigInt, 4n);

i.multiplySelf(5);
test("multiplySelf i.bigInt", i.bigInt, 20n);

i.divisionSelf(2);
test("divisionSelf i.bigInt", i.bigInt, 10n);

i.remainderSelf(3);
test("remainderSelf i.bigInt", i.bigInt, 1n);

console.log(errors);
setTimeout(()=>{}, 1000 * 60 * 60 * 24);