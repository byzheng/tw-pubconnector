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
	container.style.maxWidth = '540px';
	container.style.margin = '24px auto';
	container.style.padding = '24px 20px 20px 20px';
	container.style.background = '#f9f9fb';
	container.style.border = '1px solid #e0e0e0';
	container.style.borderRadius = '12px';
	container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';

	// Label for filter
	var label = this.document.createElement('label');
	label.textContent = 'Filter tiddlers:';
	label.style.display = 'block';
	label.style.fontWeight = 'bold';
	label.style.marginBottom = '6px';
	container.appendChild(label);

	// Input for filter
	var input = this.document.createElement('input');
	input.type = 'text';
	input.placeholder = 'Enter filter (e.g. [author:Smith])';
	input.value = this.filter || '';
	input.style.width = '100%';
	input.style.padding = '8px';
	input.style.marginBottom = '12px';
	input.style.border = '1px solid #ccc';
	input.style.borderRadius = '6px';
	input.style.fontSize = '1em';
	container.appendChild(input);

	// List area
	var listLabel = this.document.createElement('div');
	listLabel.textContent = 'Preview (max 10):';
	listLabel.style.margin = '8px 0 4px 0';
	listLabel.style.fontSize = '0.95em';
	container.appendChild(listLabel);

	var listArea = this.document.createElement('ul');
	listArea.style.maxHeight = '160px';
	listArea.style.overflowY = 'auto';
	listArea.style.background = '#fff';
	listArea.style.border = '1px solid #e0e0e0';
	listArea.style.borderRadius = '6px';
	listArea.style.padding = '8px 12px';
	listArea.style.marginBottom = '16px';
	listArea.style.fontSize = '0.97em';
	container.appendChild(listArea);

	// Button
	var button = this.document.createElement('button');
	button.textContent = 'Process';
	button.style.background = '#1976d2';
	button.style.color = '#fff';
	button.style.border = 'none';
	button.style.padding = '10px 24px';
	button.style.borderRadius = '6px';
	button.style.fontWeight = 'bold';
	button.style.fontSize = '1em';
	button.style.cursor = 'pointer';
	button.style.marginBottom = '16px';
	button.onmouseover = function() { button.style.background = '#1565c0'; };
	button.onmouseout = function() { button.style.background = '#1976d2'; };
	container.appendChild(button);

	// Output area
	var output = this.document.createElement('textarea');
	output.rows = 10;
	output.style.width = '100%';
	output.style.boxSizing = 'border-box';
	output.style.fontFamily = 'monospace';
	output.style.fontSize = '0.98em';
	output.style.background = '#f4f4f8';
	output.style.border = '1px solid #e0e0e0';
	output.style.borderRadius = '6px';
	output.style.marginTop = '10px';
	output.style.padding = '8px';
	output.readOnly = true;
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
			li.style.color = '#888';
			listArea.appendChild(li);
			return;
		}
		tiddlers.forEach(title => {
			const li = this.document.createElement('li');
			li.textContent = title;
			li.style.padding = '2px 0 2px 0';
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
		const tiddlers = this.wiki.filterTiddlers(filter);
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
			const url = `/literature/article/${encodeURIComponent(title)}/html2md`;
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
