var yaml = require('js-yaml');
var fs   = require('fs');
var Liquid = require('liquidjs');
var engine = Liquid();

var argv = require('minimist')(process.argv.slice(2));

// declare configurable variables with default values
var topComponentPath = process.cwd();
var outputDirName = 'dist';
var componentModel = 'component.yaml'

// handle arguments
if (argv['h'] || argv['help']) {  // if asked for help, print it and exit
    console.log('Usage: node parseComponent.js [options]');
    console.log('--help, -h                                         Print the usage message and exit');
    console.log('--componentPath=<Path/To/Component/>               (default=CWD)');
    console.log('--outputDirName=<directory_to_write_output_files>  (default=dist)');
    console.log('--componentModel=<filename_of_component_model>     (default=component.yaml)');
    process.exit();
} else { // otherwise process arguments
    if ('componentPath' in argv) 
        topComponentPath = argv['componentPath'];
    
    if ('outputDirName' in argv)
        outputDirName = argv['outputDirName'];
    
    if ('componentModel' in argv)
        componentModel = argv['componentModel'];
}

function processComponentItems(component, items) {
	for (k in items) {
		if (items.hasOwnProperty(k)) {
			var item = items[k];
			var selectedComponent = component.components[item.options[item.selectedOption]];
			item.descriptionLong = item.id + ": " + item.description;
			item.descriptionSelected = item.descriptionLong + " (" + selectedComponent.description + " v" + selectedComponent.version + ")";
		}
	}
}

function parseComponent(componentPath, outDir, compModelName) {
	console.log('Parse: ' + componentPath + ' to ' + outDir + '/' + compModelName);
	var component = {};
	
	// read in data stored in package.json: name, version, description, license,
	//                                      author, dependencies, components
	var packageData = JSON.parse(fs.readFileSync(componentPath + '/package.json', 'utf8'));
	component.name = packageData.name;
	component.version = packageData.version;
	component.description = packageData.description;
	component.license = packageData.license;
	component.author = packageData.author;
	
	if (packageData.hasOwnProperty('repository')) {
		component.repository = packageData.repository;
	}
	
	component.dependencies = packageData.dependencies;
	
	// set up dictionaries
	component.components = {};
	component.parts = {};
	component.tools = {};
	
	// set up promises array for LiquidJS
    var liquidPromises = [];
	
	try {
		// read in sub-components
		
		try {
			var componentsList = fs.readdirSync(componentPath + "/components/").sort();	
		} catch (error) {
			console.log("Experienced error accessing folder: " + componentPath + "/components/")
			throw new Error("Experienced error accessing folder: " + componentPath + "/components/")
		}
		
		
		
		for (i in componentsList) {
			var subComponent = parseComponent(componentPath + "/components/" + componentsList[i], outDir, compModelName);
			component.components[subComponent.name] = subComponent;
		}
		
		component.parts = yaml.safeLoad(fs.readFileSync(componentPath + "/parts.yaml", 'utf8'));
		processComponentItems(component, component.parts);
		
		component.tools = yaml.safeLoad(fs.readFileSync(componentPath + "/tools.yaml", 'utf8'));
		processComponentItems(component, component.tools);
		
		component.precautions = yaml.safeLoad(fs.readFileSync(componentPath + "/precautions.yaml", 'utf8'));

		component.assemblySteps = yaml.safeLoad(fs.readFileSync(componentPath + "/assemblySteps.yaml", 'utf8'));
		
		for (step in component.assemblySteps) {
			// how I finally figured out this closure - https://daveceddia.com/waiting-for-promises-in-a-loop/#comment-3179119368
			(function(s) {
				liquidPromises.push(engine
									.parseAndRender(component.assemblySteps[s].summary, component)
									.then(function(renderedSummary) {
										component.assemblySteps[s].summary = renderedSummary;
										// console.log(component.assemblySteps[s].summary) //ANL
									}).catch(function(e) {
										console.log(e);
									}));
				liquidPromises.push(engine
									.parseAndRender(component.assemblySteps[s].details, component)
									.then(function(renderedDetails) {
										component.assemblySteps[s].details = renderedDetails;
									}).catch(function(e) {
										console.log(e);
									}));
			})(step);
		}

		var precautionsArray = [];

		for (precaution in component.precautions) {
			(function(p) {
				
				liquidPromises.push(engine
									.parseAndRender(component.precautions[p], component)
									.then(function(renderedPrecautions) {
										precautionsArray.push(renderedPrecautions);
									}).catch(function(e) {
										console.log(e);
									}));
			})(precaution);

		}

		component.precautions = precautionsArray;
		 
	} catch (e) {
		console.log(e);
		component.precautions = yaml.safeLoad(fs.readFileSync(componentPath + "/precautions.yaml", 'utf8'));
		var precautionsArray = [];

		for (precaution in component.precautions) {
			(function(p) {
				
				liquidPromises.push(engine
									.parseAndRender(component.precautions[p], component)
									.then(function(renderedPrecautions) {
										precautionsArray.push(renderedPrecautions);
									}).catch(function(e) {
										console.log(e);
									}));
			})(precaution);

		}

		component.precautions = precautionsArray;

	}

	seanandalexa = new Promise(resolve => setTimeout(resolve, 5000));

	liquidPromises.push(seanandalexa);

	Promise.allSettled(liquidPromises)
		.then(function() {
			var componentFileName = componentPath + '/' + outDir + '/' + compModelName;
			try {
				
				fs.writeFileSync(componentFileName, yaml.safeDump(component));	
				console.log('Component Model ' + componentFileName + ' built');

			} catch (error) {
				console.log("Experienced error accessing file: " + componentFileName);
			}
			
				});
	
	return component;
}

parseComponent(topComponentPath, outputDirName, componentModel);