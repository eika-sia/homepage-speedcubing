const API_BASE_URL = "https://server.speedcubinghrvatska.hr";
const CATEGORY_NEWS = "vijesti";
const CATEGORY_INFO = "informacije";
const CATEGORY_ABOUT = "category-gen-info";

function articleBasePath() {
	return window.location.pathname.includes("/pages/")
		? "../objava/"
		: "./pages/objava/";
}

function articleHref(article) {
	const identifier = article.slug
		? `slug=${encodeURIComponent(article.slug)}`
		: `id=${encodeURIComponent(article.id)}`;

	return `${articleBasePath()}?${identifier}`;
}

function articlesUrl(categorySlug, options = {}) {
	const params = new URLSearchParams();
	const pageSize = options.pageSize || 25;
	const sort = options.sort || ["publishedAt:desc"];

	params.set("filters[category][slug][$eq]", categorySlug);
	params.set("pagination[pageSize]", String(pageSize));

	if (options.includeBlocks) {
		params.set("populate[category]", "true");
		params.set("populate[blocks][populate]", "*");
	} else {
		params.set("populate", "category");
	}

	sort.forEach((sortValue, index) => {
		params.set(`sort[${index}]`, sortValue);
	});

	return `${API_BASE_URL}/api/articles?${params.toString()}`;
}

async function fetchJson(url) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	return response.json();
}

function normalizeSearchValue(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function blockSearchText(blocks) {
	return (blocks || [])
		.map((block) => {
			if (block.__component === "shared.rich-text") {
				return block.body || "";
			}

			if (block.__component === "shared.media") {
				const file = mediaFile(
					block.file || block.media || block.image,
				);
				return [file?.name, file?.alternativeText, file?.caption]
					.filter(Boolean)
					.join(" ");
			}

			if (block.__component === "shared.gallery") {
				return mediaFiles(
					block.image || block.images || block.files || block.gallery,
				)
					.map((file) =>
						[file?.name, file?.alternativeText, file?.caption]
							.filter(Boolean)
							.join(" "),
					)
					.join(" ");
			}

			return "";
		})
		.join(" ");
}

function normalizeArticle(item) {
	const article = item.attributes || item;
	const blocks = article.blocks || [];

	return {
		id: article.documentId || item.documentId || article.id || item.id,
		title: article.title || "Objava udruge",
		description: article.description || article.subtitle || "",
		slug: article.slug || "",
		place: article.Mjesto || article.mjesto || "",
		date: article.Datum || article.Vrijeme || article.vrijeme || "",
		publishedAt: article.publishedAt || "",
		category:
			article.category?.name ||
			article.category?.data?.attributes?.name ||
			"",
		categorySlug:
			article.category?.slug ||
			article.category?.data?.attributes?.slug ||
			"",
		blocks,
		searchText: blockSearchText(blocks),
	};
}

function renderArticleStatus(target, message) {
	target.innerHTML = "";

	const status = document.createElement("div");
	status.className = "article-status";
	status.setAttribute("role", "status");
	status.textContent = message;
	target.appendChild(status);
}

function formatDate(value) {
	if (!value) {
		return "";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat("hr-HR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

function renderArticleCards(target, articles, options = {}) {
	target.innerHTML = "";
	const emptyText = options.emptyText || "Trenutno nema objava za prikaz.";
	const kickerText = options.kicker || "Objava";
	const showMeta = Boolean(options.showMeta);

	if (!articles.length) {
		renderArticleStatus(target, emptyText);
		return;
	}

	articles.forEach((article) => {
		const card = document.createElement("a");
		card.className = "article-card";
		card.href = articleHref(article);

		const content = document.createElement("span");

		const kicker = document.createElement("span");
		kicker.className = "action-card-kicker";
		kicker.textContent = article.category || kickerText;

		const title = document.createElement("h3");
		title.textContent = article.title;

		const description = document.createElement("p");
		description.textContent = article.description;

		const link = document.createElement("span");
		link.className = "article-card-link";
		link.textContent = "Otvori objavu";

		content.append(kicker, title);

		if (article.description) {
			content.appendChild(description);
		}

		if (showMeta && (article.date || article.place)) {
			const meta = document.createElement("span");
			meta.className = "article-meta";
			meta.textContent = [formatDate(article.date), article.place]
				.filter(Boolean)
				.join(" · ");
			content.appendChild(meta);
		}

		card.append(content, link);
		target.appendChild(card);
	});
}

async function loadHomepageArticles(target, categorySlug, options = {}) {
	if (!target) {
		return;
	}

	try {
		const data = await fetchJson(
			articlesUrl(categorySlug, {
				pageSize: options.pageSize || 4,
				sort: options.sort || ["Datum:desc", "publishedAt:desc"],
			}),
		);
		const articles = (data.data || []).map(normalizeArticle);
		renderArticleCards(target, articles, options);
	} catch (error) {
		// Keep the existing skeleton visible while the remote feed is unavailable.
	}
}

async function fetchData() {
	const latestNews = document.getElementById("latestNewsGrid");
	const latestInfo = document.getElementById("latestInfoGrid");
	const aboutInfo = document.getElementById("aboutInfoGrid");

	await Promise.all([
		loadHomepageArticles(latestNews, CATEGORY_NEWS, {
			kicker: "Vijesti",
			showMeta: true,
			emptyText: "Trenutno nema vijesti za prikaz.",
		}),
		loadHomepageArticles(latestInfo, CATEGORY_INFO, {
			kicker: "Informacije",
			showMeta: true,
			emptyText: "Trenutno nema informacija za prikaz.",
		}),
		loadHomepageArticles(aboutInfo, CATEGORY_ABOUT, {
			pageSize: 4,
			sort: ["publishedAt:desc"],
			kicker: "O udruzi",
			emptyText: "Trenutno nema objava za prikaz.",
		}),
	]);
}

function escapeHtml(value) {
	return String(value || "").replace(/[&<>"']/g, (character) => {
		const replacements = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;",
		};

		return replacements[character];
	});
}

function safeUrl(value) {
	try {
		const url = new URL(
			String(value).replace(/&amp;/g, "&"),
			window.location.href,
		);
		const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];

		if (allowedProtocols.includes(url.protocol)) {
			return url.href;
		}
	} catch (error) {
		return "";
	}

	return "";
}

function renderInlineMarkdown(value) {
	let rendered = escapeHtml(value);

	rendered = rendered.replace(
		/\[([^\]]+)\]\(([^)\s]+)\)/g,
		(match, label, url) => {
			const href = safeUrl(url);

			if (!href) {
				return label;
			}

			const target = href.startsWith("http")
				? ' target="_blank" rel="noreferrer"'
				: "";
			return `<a href="${href}"${target}>${label}</a>`;
		},
	);

	rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	rendered = rendered.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");

	return rendered;
}

function parseAttributes(value) {
	const attributes = {};
	const attributePattern = /([a-z-]+)(?:\s*=\s*(['"])(.*?)\2)?/g;
	let match = attributePattern.exec(value);

	while (match) {
		attributes[match[1]] = match[3] || "";
		match = attributePattern.exec(value);
	}

	return attributes;
}

function renderStripeBuyButton(value) {
	const match = value.match(
		/^<stripe-buy-button\s+([^>]*)>\s*<\/stripe-buy-button>$/i,
	);

	if (!match) {
		return "";
	}

	const attributes = parseAttributes(match[1]);
	const buyButtonId = attributes["buy-button-id"] || "";
	const publishableKey = attributes["publishable-key"] || "";
	const validBuyButton = /^buy_btn_[A-Za-z0-9]+$/.test(buyButtonId);
	const validKey = /^pk_(live|test)_[A-Za-z0-9]+$/.test(publishableKey);

	if (!validBuyButton || !validKey) {
		return "";
	}

	return [
		'<div class="payment-widget">',
		`<stripe-buy-button buy-button-id="${escapeHtml(buyButtonId)}" publishable-key="${escapeHtml(publishableKey)}"></stripe-buy-button>`,
		"</div>",
	].join("");
}

function safeEmbedUrl(value) {
	try {
		const url = new URL(String(value).replace(/&amp;/g, "&"));
		const hostname = url.hostname.replace(/^www\./, "");
		const allowedYoutubeHost =
			hostname === "youtube.com" || hostname === "youtube-nocookie.com";
		const allowedCopilotHost =
			hostname === "copilotstudio.preview.microsoft.com";

		if (url.protocol !== "https:") {
			return "";
		}

		if (allowedYoutubeHost && url.pathname.startsWith("/embed/")) {
			return url.href;
		}

		if (allowedCopilotHost) {
			return url.href;
		}
	} catch (error) {
		return "";
	}

	return "";
}

function renderIframe(value) {
	const match = value.match(/^<iframe\s+([^>]*)>\s*<\/iframe>$/i);

	if (!match) {
		return "";
	}

	const attributes = parseAttributes(match[1]);
	const src = safeEmbedUrl(attributes.src || "");

	if (!src) {
		return "";
	}

	const title = attributes.title || "Ugrađeni sadržaj";

	return [
		'<div class="embed-frame">',
		`<iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
		"</div>",
	].join("");
}

function renderCtaLink(value) {
	const match = value.match(/^<a\s+([^>]*)>(.*?)<\/a>$/i);

	if (!match) {
		return "";
	}

	const attributes = parseAttributes(match[1]);
	const classes = String(attributes.class || "").split(/\s+/);

	if (!classes.includes("big-link")) {
		return "";
	}

	const href = safeUrl(attributes.href || "");

	if (!href) {
		return "";
	}

	const target = href.startsWith("http")
		? ' target="_blank" rel="noreferrer"'
		: "";
	return `<p><a class="big-link" href="${href}"${target}>${escapeHtml(match[2])}</a></p>`;
}

function renderAllowedHtmlBlock(value) {
	return (
		renderStripeBuyButton(value) ||
		renderIframe(value) ||
		renderCtaLink(value)
	);
}

function markdownToHtml(markdown) {
	const lines = String(markdown || "").split(/\r?\n/);
	const output = [];
	let listOpen = false;

	const closeList = () => {
		if (listOpen) {
			output.push("</ul>");
			listOpen = false;
		}
	};

	lines.forEach((line) => {
		const trimmed = line.trim();

		if (!trimmed) {
			closeList();
			return;
		}

		const allowedHtmlBlock = renderAllowedHtmlBlock(trimmed);

		if (allowedHtmlBlock) {
			closeList();
			output.push(allowedHtmlBlock);
			return;
		}

		const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);

		if (headingMatch) {
			closeList();
			const level = headingMatch[1].length + 1;
			output.push(
				`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
			);
			return;
		}

		const listMatch = trimmed.match(/^[-*]\s+(.+)$/);

		if (listMatch) {
			if (!listOpen) {
				output.push("<ul>");
				listOpen = true;
			}

			output.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
			return;
		}

		closeList();
		output.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
	});

	closeList();
	return output.join("");
}

function mediaUrl(media) {
	const mediaValue = media && (media.data ? media.data.attributes : media);

	if (!mediaValue || !mediaValue.url) {
		return "";
	}

	return mediaValue.url.startsWith("http")
		? mediaValue.url
		: `${API_BASE_URL}${mediaValue.url}`;
}

function mediaFile(value) {
	if (!value) {
		return null;
	}

	if (value.data) {
		return Array.isArray(value.data)
			? value.data.map((item) => item.attributes || item)
			: value.data.attributes || value.data;
	}

	return value.attributes || value;
}

function mediaFiles(value) {
	const file = mediaFile(value);

	if (!file) {
		return [];
	}

	return Array.isArray(file) ? file : [file];
}

function imageVariantUrl(file, variant = "large") {
	const selected =
		file?.formats?.[variant] ||
		file?.formats?.medium ||
		file?.formats?.small ||
		file;
	return mediaUrl(selected);
}

function originalMediaUrl(file) {
	return mediaUrl(file);
}

function fileAlt(file, fallback) {
	return file?.alternativeText || file?.caption || file?.name || fallback;
}

function appendCaption(figure, file) {
	if (!file?.caption) {
		return;
	}

	const caption = document.createElement("figcaption");
	caption.textContent = file.caption;
	figure.appendChild(caption);
}

function renderImageFigure(file, fallbackAlt) {
	const src = imageVariantUrl(file);

	if (!src) {
		return null;
	}

	const figure = document.createElement("figure");
	figure.className = "article-media";

	const link = document.createElement("a");
	link.href = originalMediaUrl(file) || src;
	link.target = "_blank";
	link.rel = "noreferrer";
	link.dataset.lightboxSrc = link.href;
	link.dataset.lightboxAlt = fileAlt(file, fallbackAlt);

	const image = document.createElement("img");
	image.src = src;
	image.alt = fileAlt(file, fallbackAlt);
	image.loading = "lazy";

	link.appendChild(image);
	figure.appendChild(link);
	appendCaption(figure, file);

	return figure;
}

function renderMediaFile(file, fallbackAlt) {
	if (!file) {
		return null;
	}

	if (String(file.mime || "").startsWith("image/")) {
		return renderImageFigure(file, fallbackAlt);
	}

	if (String(file.mime || "").startsWith("video/")) {
		const src = originalMediaUrl(file);

		if (!src) {
			return null;
		}

		const figure = document.createElement("figure");
		figure.className = "article-media";

		const video = document.createElement("video");
		video.src = src;
		video.controls = true;
		video.preload = "metadata";

		figure.appendChild(video);
		appendCaption(figure, file);
		return figure;
	}

	const href = originalMediaUrl(file);

	if (!href) {
		return null;
	}

	const link = document.createElement("a");
	link.className = "button button-secondary article-file-link";
	link.href = href;
	link.target = "_blank";
	link.rel = "noreferrer";
	link.textContent = file.name || "Preuzmi datoteku";
	return link;
}

function renderGallery(files, fallbackAlt) {
	const images = files.filter((file) =>
		String(file.mime || "").startsWith("image/"),
	);

	if (!images.length) {
		return null;
	}

	const gallery = document.createElement("div");
	gallery.className = "article-gallery";

	images.forEach((file, index) => {
		const src = imageVariantUrl(file, "medium");

		if (!src) {
			return;
		}

		const link = document.createElement("a");
		link.href = originalMediaUrl(file) || src;
		link.target = "_blank";
		link.rel = "noreferrer";
		link.dataset.lightboxSrc = link.href;
		link.dataset.lightboxAlt = fileAlt(
			file,
			`${fallbackAlt} - slika ${index + 1}`,
		);

		const image = document.createElement("img");
		image.src = src;
		image.alt = fileAlt(file, `${fallbackAlt} - slika ${index + 1}`);
		image.loading = "lazy";

		link.appendChild(image);
		gallery.appendChild(link);
	});

	return gallery.children.length ? gallery : null;
}

async function loadRemoteArticle(identifier) {
	const params = new URLSearchParams();
	const filterKey = identifier.slug
		? "filters[slug][$eq]"
		: "filters[documentId][$eq]";

	params.set(filterKey, identifier.slug || identifier.id);
	params.set("populate[blocks][populate]", "*");

	const data = await fetchJson(
		`${API_BASE_URL}/api/articles?${params.toString()}`,
	);
	const article = data.data && data.data[0];

	if (!article) {
		throw new Error("Remote article not found");
	}

	return normalizeArticle(article);
}

function renderError(shell, message) {
	shell.innerHTML = "";

	const kicker = document.createElement("p");
	kicker.className = "eyebrow";
	kicker.textContent = "Objava";

	const title = document.createElement("h1");
	title.textContent = "Objava nije dostupna";

	const description = document.createElement("p");
	description.className = "article-description";
	description.textContent = message;

	const link = document.createElement("a");
	link.className = "button button-secondary";
	link.href = "../../index.html#novosti";
	link.textContent = "Natrag na objave";

	shell.append(kicker, title, description, link);
}

function renderArticle(shell, article) {
	document.title = `${article.title} | Speedcubing Hrvatska`;
	shell.innerHTML = "";

	const kicker = document.createElement("p");
	kicker.className = "eyebrow";
	kicker.textContent = "Objava";

	const title = document.createElement("h1");
	title.textContent = article.title;

	const metaText = [formatDate(article.date || article.publishedAt), article.place]
		.filter(Boolean)
		.join(" · ");
	const meta = metaText ? document.createElement("p") : null;

	if (meta) {
		meta.className = "article-meta";
		meta.textContent = metaText;
	}

	const description = document.createElement("p");
	description.className = "article-description";
	description.textContent = article.description;

	const content = document.createElement("div");
	content.className = "article-content ctext";

	article.blocks.forEach((block) => {
		if (block.__component === "shared.media") {
			const file = mediaFile(block.file || block.media || block.image);
			const element = renderMediaFile(file, article.title);

			if (element) {
				content.appendChild(element);
			}
			return;
		}

		if (block.__component === "shared.gallery") {
			const files = mediaFiles(
				block.image || block.images || block.files || block.gallery,
			);
			const gallery = renderGallery(files, article.title);

			if (gallery) {
				content.appendChild(gallery);
			}
			return;
		}

		if (block.__component === "shared.rich-text") {
			const richText = document.createElement("div");
			richText.innerHTML = markdownToHtml(block.body);
			content.appendChild(richText);
		}
	});

	if (!content.children.length) {
		const empty = document.createElement("p");
		empty.textContent = "Ova objava nema dodatnog sadržaja.";
		content.appendChild(empty);
	}

	if (article.description) {
		shell.append(kicker, title, ...(meta ? [meta] : []), description, content);
		return;
	}

	shell.append(kicker, title, ...(meta ? [meta] : []), content);
}

function compareArticles(a, b, sortOrder) {
	if (sortOrder === "date-asc") {
		return String(a.date || a.publishedAt).localeCompare(
			String(b.date || b.publishedAt),
		);
	}

	if (sortOrder === "place-asc") {
		return (
			String(a.place).localeCompare(String(b.place), "hr") ||
			String(a.title).localeCompare(String(b.title), "hr")
		);
	}

	if (sortOrder === "title-asc") {
		return String(a.title).localeCompare(String(b.title), "hr");
	}

	return String(b.date || b.publishedAt).localeCompare(
		String(a.date || a.publishedAt),
	);
}

function articleMatchesFilters(article, filters) {
	const searchable = normalizeSearchValue(
		`${article.title} ${article.description} ${article.place} ${article.searchText}`,
	);
	const searchTokens = filters.search.split(/\s+/).filter(Boolean);
	const date = article.date || "";

	if (
		searchTokens.length &&
		!searchTokens.every((token) => searchable.includes(token))
	) {
		return false;
	}

	if (filters.place && article.place !== filters.place) {
		return false;
	}

	if (filters.from && (!date || date < filters.from)) {
		return false;
	}

	if (filters.to && (!date || date > filters.to)) {
		return false;
	}

	return true;
}

function updateArchiveCount(countElement, count, labels = {}) {
	if (!countElement) {
		return;
	}

	const singular = labels.singular || "vijest";
	const plural = labels.plural || "vijesti";

	if (count === 1) {
		countElement.textContent = `1 ${singular}`;
		return;
	}

	countElement.textContent = `${count} ${plural}`;
}

function populatePlaceFilter(selectElement, articles) {
	if (!selectElement) {
		return;
	}

	const places = Array.from(
		new Set(articles.map((article) => article.place).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b, "hr"));

	places.forEach((place) => {
		const option = document.createElement("option");
		option.value = place;
		option.textContent = place;
		selectElement.appendChild(option);
	});
}

async function initArticleArchive(config) {
	const grid = document.getElementById(config.gridId);
	const form = document.getElementById(config.formId);
	const countElement = document.getElementById(config.countId);
	const searchInput = document.getElementById(config.searchId);
	const placeSelect = document.getElementById(config.placeId);
	const dateFromInput = document.getElementById(config.dateFromId);
	const dateToInput = document.getElementById(config.dateToId);
	const sortSelect = document.getElementById(config.sortId);

	if (!grid || !form) {
		return;
	}

	let articles = [];

	const renderFilteredArticles = () => {
		const filters = {
			search: normalizeSearchValue(searchInput.value.trim()),
			place: placeSelect.value,
			from: dateFromInput.value,
			to: dateToInput.value,
			sort: sortSelect.value,
		};
		const filtered = articles
			.filter((article) => articleMatchesFilters(article, filters))
			.sort((a, b) => compareArticles(a, b, filters.sort));

		updateArchiveCount(countElement, filtered.length, config.countLabels);
		renderArticleCards(grid, filtered, {
			kicker: config.kicker,
			showMeta: Boolean(config.showMeta),
			emptyText: config.emptyText,
		});
	};

	try {
		const data = await fetchJson(
			articlesUrl(config.categorySlug, {
				pageSize: config.pageSize || 100,
				sort:
					config.sort || ["Datum:desc", "publishedAt:desc"],
				includeBlocks: true,
			}),
		);
		articles = (data.data || []).map(normalizeArticle);
		populatePlaceFilter(placeSelect, articles);
		renderFilteredArticles();
	} catch (error) {
		// Keep the existing skeleton visible while the remote feed is unavailable.
		return;
	}

	searchInput.addEventListener("input", renderFilteredArticles);
	placeSelect.addEventListener("change", renderFilteredArticles);
	dateFromInput.addEventListener("change", renderFilteredArticles);
	dateToInput.addEventListener("change", renderFilteredArticles);
	sortSelect.addEventListener("change", renderFilteredArticles);
	form.addEventListener("reset", () => {
		window.setTimeout(renderFilteredArticles, 0);
	});
}

async function initNewsArchive() {
	return initArticleArchive({
		gridId: "newsArchiveGrid",
		formId: "newsFilters",
		countId: "newsArchiveCount",
		searchId: "newsSearch",
		placeId: "placeFilter",
		dateFromId: "dateFromFilter",
		dateToId: "dateToFilter",
		sortId: "sortFilter",
		categorySlug: CATEGORY_NEWS,
		kicker: "Vijesti",
		showMeta: true,
		emptyText: "Nema vijesti koje odgovaraju filtrima.",
		countLabels: {
			singular: "vijest",
			plural: "vijesti",
		},
	});
}

async function initInfoArchive() {
	return initArticleArchive({
		gridId: "infoArchiveGrid",
		formId: "infoFilters",
		countId: "infoArchiveCount",
		searchId: "infoSearch",
		placeId: "infoPlaceFilter",
		dateFromId: "infoDateFromFilter",
		dateToId: "infoDateToFilter",
		sortId: "infoSortFilter",
		categorySlug: CATEGORY_INFO,
		kicker: "Informacije",
		showMeta: true,
		emptyText: "Nema informacija koje odgovaraju filtrima.",
		countLabels: {
			singular: "informacija",
			plural: "informacije",
		},
	});
}

async function createData() {
	const shell = document.getElementById("articleShell");
	const urlParams = new URLSearchParams(window.location.search);
	const id = urlParams.get("id");
	const slug = urlParams.get("slug");

	if (!shell) {
		return;
	}

	if (!id && !slug) {
		renderError(shell, "Nedostaje identifikator objave.");
		return;
	}

	try {
		const article = await loadRemoteArticle({ id, slug });
		renderArticle(shell, article);
	} catch (remoteError) {
		// Keep the existing skeleton visible while the remote article is unavailable.
	}
}
