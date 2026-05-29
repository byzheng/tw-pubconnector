/*\
title: $:/plugins/bangyou/tw-pubconnector/widget/batch-process.js
type: application/javascript
module-type: widget
\*/

(function(){
"use strict";

var Widget = require('$:/core/modules/widgets/widget.js').widget;

var BatchProcessWidget = function(parseTreeNode,options) {
	Widget.call(this,parseTreeNode,options);
};


BatchProcessWidget.prototype = Object.create(Widget.prototype);


BatchProcessWidget.prototype.render = function(parent,nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();

	// Create container
	var container = this.document.createElement('div');
	container.className = 'tw-pubconnector-batch-process';

	// Input for filter
	var input = this.document.createElement('input');
	input.type = 'text';
	input.placeholder = 'Enter filter (e.g. [author:Smith])';
	input.value = this.filter || '';
	container.appendChild(input);

	// List area
	var listArea = this.document.createElement('ul');
	listArea.style.maxHeight = '160px';
	listArea.style.overflowY = 'auto';
	container.appendChild(listArea);

	// Button
	var button = this.document.createElement('button');
	button.textContent = 'Process';
	container.appendChild(button);

	// Output area
	var output = this.document.createElement('textarea');
	output.rows = 10;
	output.cols = 60;
	output.readOnly = true;
	output.style.display = 'block';
	output.style.marginTop = '8px';
	container.appendChild(output);

	// Add to DOM
	parent.insertBefore(container,nextSibling);
	this.domNodes.push(container);

	// Helper to update tiddler list
	const updateList = () => {
		let filter = input.value.trim();
		if(filter && !/\[tag\[bibtex-entry\]\]/.test(filter)) {
			filter += ' +[tag[bibtex-entry]]';
		}
		const tiddlers = this.wiki.filterTiddlers(filter).slice(0,10);
		listArea.innerHTML = '';
		if(!tiddlers.length) {
			const li = this.document.createElement('li');
			li.textContent = 'No tiddlers found.';
			listArea.appendChild(li);
			return;
		}
		tiddlers.forEach(title => {
			const li = this.document.createElement('li');
			li.textContent = title;
			listArea.appendChild(li);
		});
	};

	input.addEventListener('input', updateList);
	updateList();

	// Handler
	button.addEventListener('click',() => {
		let filter = input.value.trim();
		if(filter && !/\[tag\[bibtex-entry\]\]/.test(filter)) {
			filter += ' +[tag[bibtex-entry]]';
		}
		output.value = 'Processing...\n';
		const tiddlers = this.wiki.filterTiddlers(filter).slice(0,10);
		if(!tiddlers.length) {
			output.value += 'No tiddlers found.\n';
			return;
		}
		let processed = 0;
		let errors = 0;
		const processNext = () => {
			if(processed >= tiddlers.length) {
				output.value += `Done. Processed: ${processed}, Errors: ${errors}`;
				return;
			}
			const title = tiddlers[processed];
			const url = `/literature/article/${encodeURIComponent(title)}/html2word`;
			fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' } })
				.then(res => res.json())
				.then(data => {
					if(data.status === 'success') {
						output.value += `Processed ${title}: OK\n`;
					} else {
						output.value += `Error processing ${title}: ${data.message}\n`;
						errors++;
					}
					processed++;
					processNext();
				})
				.catch(e => {
					output.value += `Exception processing ${title}: ${e}\n`;
					errors++;
					processed++;
					processNext();
				});
		};
		processNext();
	});
};
BatchProcessWidget.prototype.execute = function() {
	this.filter = this.getAttribute('filter','');
};

BatchProcessWidget.prototype.refresh = function(changedTiddlers) {
	return this.refreshChildren(changedTiddlers);
};

exports['batch-process'] = BatchProcessWidget;

})();
