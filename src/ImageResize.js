import defaultsDeep from "lodash/defaultsDeep";
import DefaultOptions from "./DefaultOptions";
import { DisplaySize } from "./modules/DisplaySize";
import { Resize } from "./modules/Resize";
import { Toolbar } from "./modules/Toolbar";

const knownModules = { DisplaySize, Toolbar, Resize };

/**
 * Custom module for quilljs to allow user to resize <img> elements
 * (Works on Chrome, Edge, Safari and replaces Firefox's native resize behavior)
 * @see https://v1.quilljs.com/blog/building-a-custom-module/
 */
export default class ImageResize {
	constructor(quill, options = {}) {
		// save the quill reference and options
		this.quill = quill;

		// Apply the options to our defaults, and stash them for later
		// defaultsDeep doesn't do arrays as you'd expect, so we'll need to apply the classes array from options separately
		let moduleClasses = false;
		if (options.modules) {
			moduleClasses = options.modules.slice();
		}

		// Apply options to default options
		this.options = defaultsDeep({}, options, DefaultOptions);

		// (see above about moduleClasses)
		if (moduleClasses !== false) {
			this.options.modules = moduleClasses;
		}

		this.quill.root.addEventListener(
			"click",
			this.handleClickInsideQuillInstance,
			false
		);

		this.quill.root.parentNode.style.position =
			this.quill.root.parentNode.style.position || "relative";

		// setup modules
		this.moduleClasses = this.options.modules;

		this.modules = [];
	}

	initializeModules = () => {
		this.removeModules();

		this.modules = this.moduleClasses.map(
			(ModuleClass) =>
				new (knownModules[ModuleClass] || ModuleClass)(this)
		);

		this.modules.forEach((module) => {
			module.onCreate();
		});

		this.onUpdate();
	};

	onUpdate = () => {
		this.repositionElements();
		this.modules.forEach((module) => {
			module.onUpdate();
		});
	};

	removeModules = () => {
		this.modules.forEach((module) => {
			module.onDestroy();
		});

		this.modules = [];
	};

	handleClickInsideQuillInstance = (evt) => {
		this.hide();

		if (
			evt.target &&
			evt.target.tagName &&
			evt.target.tagName.toUpperCase() === "IMG"
		) {
			// clicked on an image inside the editor
			this.show(evt.target);
		}
	};

	handleClickOutsideQuillInstance = (evt) => {
		// if the click is outside the quill instance, hide
		if (!this.quill.root.contains(evt.target)) {
			this.hide();
		}
	};

	show = (img) => {
		// keep track of this img element
		this.img = img;

		this.showOverlay();

		this.initializeModules();
	};

	showOverlay = () => {
		if (this.overlay) {
			this.hideOverlay();
		}

		this.quill.setSelection(null);

		// prevent spurious text selection
		this.setUserSelect("none");

		window.addEventListener(
			"click",
			this.handleClickOutsideQuillInstance,
			true
		);

		// Create and add the overlay
		this.overlay = document.createElement("div");
		Object.assign(this.overlay.style, this.options.overlayStyles);

		// set tabIndex to listen for keyup event
		this.quill.root.parentNode.setAttribute("tabIndex", 0);

		// listen for the image being deleted or moved
		this.quill.root.parentNode.addEventListener("keyup", this.checkImage);
		this.quill.root.parentNode.focus();

		this.quill.root.parentNode.appendChild(this.overlay);

		this.repositionElements();
	};

	hideOverlay = () => {
		if (!this.overlay) {
			return;
		}

		// Remove the overlay
		this.quill.root.parentNode.removeChild(this.overlay);
		// stop listening for image deletion or movement
		this.quill.root.parentNode.removeEventListener(
			"keyup",
			this.checkImage
		);
		this.overlay = undefined;

		// reset user-select
		this.setUserSelect("");
	};

	repositionElements = () => {
		if (!this.overlay || !this.img) {
			return;
		}

		// position the overlay over the image
		const parent = this.quill.root.parentNode;
		const imgRect = this.img.getBoundingClientRect();
		const containerRect = parent.getBoundingClientRect();

		Object.assign(this.overlay.style, {
			left: `${
				imgRect.left - containerRect.left - 1 + parent.scrollLeft
			}px`,
			top: `${imgRect.top - containerRect.top + parent.scrollTop}px`,
			width: `${imgRect.width}px`,
			height: `${imgRect.height}px`,
		});
	};

	hide = () => {
		this.hideOverlay();
		this.removeModules();
		this.img = undefined;
	};

	setUserSelect = (value) => {
		[
			"userSelect",
			"mozUserSelect",
			"webkitUserSelect",
			"msUserSelect",
		].forEach((prop) => {
			// set on contenteditable element and <html>
			this.quill.root.style[prop] = value;
			document.documentElement.style[prop] = value;
		});
	};

	copyImageToClipboard = () => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");

		canvas.width = this.img.naturalWidth;
		canvas.height = this.img.naturalHeight;
		ctx.drawImage(this.img, 0, 0);

		return new Promise((resolve, reject) => {
			canvas.toBlob(async function (blob) {
				const item = new ClipboardItem({ [blob.type]: blob });
				navigator.clipboard
					.write([item])
					.then(function () {
						// Image added to clipboard, type: " + blob.type
						resolve(true);
					})
					.catch(function (err) {
						alert(
							"Error adding image to clipboard: " +
								err.name +
								" -> " +
								err.message
						);
						reject();
					});
			});
		});
	};

	checkImage = async (evt) => {
		if (this.img) {
			if (evt.keyCode == 46 || evt.keyCode == 8) {
				this.deleteImage(this.img);
				this.hide();
			}

			// copy
			if (
				(evt.ctrlKey /* Win */ || evt.metaKey) /* Mac */ &&
				evt.key === "c"
			) {
				evt.preventDefault();
				this.copyImageToClipboard();
			}

			// cut
			if (
				(evt.ctrlKey /* Win */ || evt.metaKey) /* Mac */ &&
				evt.key === "x"
			) {
				evt.preventDefault();
				const imageCopied = await this.copyImageToClipboard();

				if (imageCopied) {
					this.deleteImage(this.img);
					this.hide();
				}
			}
		}
	};

	deleteImage = (img) => {
		window.Quill.find(img).deleteAt(0);
	};
}

if (window.Quill) {
	window.Quill.register("modules/imageResize", ImageResize);
}
