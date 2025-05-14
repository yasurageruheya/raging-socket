class TreelikeMap
{
	/**
	 *
	 * @param {any} [value]
	 * @param {TreelikeMap} [parent]
	 */
	constructor(value="", parent)
	{
		/** @type {any} */
		this.value = value;
		/** @type {Map<TreelikeMap>} */
		this.children = new Map();
		/** @type {TreelikeMap} */
		this.parent = parent;
	}

	/**
	 *
	 * @param {any} key
	 * @return {boolean}
	 */
	has(key) { return this.children.has(key); }

	/**
	 *
	 * @param {any} key
	 * @return {TreelikeMap}
	 */
	get(key) { return this.children.get(key); }

	/**
	 *
	 * @param {any} key
	 * @param {any} [value]
	 * @return {TreelikeMap}
	 */
	set(key, value)
	{
		this.children.set(key, new TreelikeMap(value, this));
		return this;
	}

	/**
	 *
	 * @return {IterableIterator<TreelikeMap>}
	 */
	keys() { return this.children.keys(); }

	/**
	 *
	 * @param {any} key
	 * @param {boolean} [all=false]
	 * @return {boolean}
	 */
	remove(key, all=false)
	{
		if(this.children.has(key))
		{
			const child = this.get(key);
			if(all)
			{
				child.children.forEach(grandchild =>
				{
					grandchild.value = null;
					delete grandchild.value;
					grandchild.parent = null;
					delete grandchild.parent;
					grandchild.remove(key, all)
				});
			}
			child.value = null;
			delete child.value;
			child.parent = null;
			delete child.parent;
		}
		return this.children.delete(key);
	}

	/**
	 *
	 * @return {number}
	 */
	get size() { return this.children.size; }
}

module.exports = TreelikeMap;