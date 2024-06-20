class TreelikeMap
{
	/**
	 *
	 * @param [value] {any}
	 * @param [parent] {TreelikeMap}
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
	 * @param key {any}
	 * @return {boolean}
	 */
	has(key) { return this.children.has(key); }

	/**
	 *
	 * @param key {any}
	 * @return {TreelikeMap}
	 */
	get(key) { return this.children.get(key); }

	/**
	 *
	 * @param key {any}
	 * @param [value] {any}
	 * @return {TreelikeMap}
	 */
	set(key, value)
	{
		this.children.set(key, new TreelikeMap(value, this));
		return this;
	}

	/**
	 *
	 * @param key {any}
	 * @param [all=false] {boolean}
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