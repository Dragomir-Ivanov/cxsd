// This file is part of cxsd, copyright (c) 2015-2016 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import * as Promise from 'bluebird';
import * as path from 'path';

import {Address, Cache} from 'cget'

import {Transform} from '../transform/Transform';
import {Type} from '../Type';
import { FileSystemCache } from 'cget/dist/strategy';

export interface State {
	cache: Cache;
}

export abstract class Exporter extends Transform<Exporter, boolean, State> {
	constructor(doc: Type, cache: Cache) {
		super(doc);
		this.state = { cache: cache };
	}

	writeHeader() {
		var output: string[] = [];
		var importTbl = this.namespace.getUsedImportTbl();

		for(var shortName of Object.keys(importTbl).sort()) {
			if (shortName == 'Primitive') continue;

			var namespace = importTbl[shortName];
			var relativePath = this.getPathTo(namespace.name);
			output.push(this.writeImport(shortName, relativePath, namespace.name));
		}

		return(output);
	}

	abstract writeImport(shortName: string, relativePath: string, absolutePath: string): string;

	/** Output namespace contents to cache, if not already exported. */

	prepare() {
		var doc = this.doc;
		if(!doc) return(null);

		const fsCache: FileSystemCache = this.state.cache.storePipeline[0] as FileSystemCache;

		this.cacheDir = path.dirname(
            fsCache.getCachePathSync(doc.namespace.name)
		);

		var outName = this.getOutName(doc.namespace.name);

        let isCachedResult = fsCache.isCached(outName);
        if(!isCachedResult) {
        	return Promise.resolve(null);
		}

        return(isCachedResult.then((isCached: boolean) => {
			if(isCached) return(null);

			const outName_force = new Address(outName.match(/https?:\/\//) ? outName : path.join('/', outName));
			outName_force.isLocal = false;

			return(this.state.cache.store(
				outName_force,
				this.writeContents()
			));
		}));
	}

	abstract writeContents(): string;

	/** Get relative path to another namespace within the cache. */

	getPathTo(name: string) {
		// Append and then strip a file extension so references to a parent
		// directory will target the directory by name instead of .. or similar.

        const fsCache: FileSystemCache = this.state.cache.storePipeline[0] as FileSystemCache;
        var targetPath = fsCache.getCachePathSync(name) + '.js';

		// Always output forward slashes.
		// If path.sep is a backslash as on Windows, we need to escape it (as a double-backslash) for it to be a valid Regex.
		// We are using a Regex because the alternative string.replace(string, string) overload only replaces the first occurance.
		var separatorRegex = new RegExp(path.sep.replace("\\", "\\\\"), 'g');
		
		var relPath = path.relative(
			this.cacheDir,
			targetPath
		).replace(separatorRegex, '/').replace(/\.js$/, '');

		if(!relPath.match(/^[./]/)) relPath = './' + relPath;

		return(relPath);
	}

	protected abstract getOutName(name: string): string;

	protected state: State;

	/** Full path of directory containing exported output for the current namespace. */
	protected cacheDir: string;
}
