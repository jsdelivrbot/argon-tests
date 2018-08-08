/// <reference types="@argonjs/argon" />
/// <reference types="three" />
/// <reference types="dat-gui" />
/// <reference types="stats" />
// set up Argon.  Share the canvas so the webrtc reality can draw the
// video background in it
var app = Argon.init(null, { 'sharedCanvas': true }, null);
// set up THREE.  Create a scene, a perspective camera and an object
// for the user's location
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera();
var userLocation = new THREE.Object3D();
scene.add(camera);
scene.add(userLocation);
scene.autoUpdate = false;
// We use the standard WebGLRenderer when we only need WebGL-based content
var renderer = new THREE.WebGLRenderer({
    alpha: true,
    logarithmicDepthBuffer: true,
    antialias: Argon.suggestedWebGLContextAntialiasAttribute
});
// account for the pixel density of the device
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.bottom = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
app.view.element.appendChild(renderer.domElement);
// do not clear the canvas when sharing it
renderer.autoClear = false;
// to easily control stuff on the display
var hud = new THREE.CSS3DArgonHUD();
// We put some elements in the index.html, for convenience. 
// Here, we retrieve the description box and move it to the 
// the CSS3DArgonHUD hudElements[0].  We only put it in the left
// hud since we'll be hiding it in stereo
var description = document.getElementById('description');
hud.hudElements[0].appendChild(description);
app.view.element.appendChild(hud.domElement);
// let's show the rendering stats
var stats = new Stats();
hud.hudElements[0].appendChild(stats.dom);
// set the layers of our view
app.view.setLayers([
    { source: renderer.domElement },
    { source: hud.domElement }
]);
// create a bit of animated 3D text that says "argon.js" to display 
var uniforms = {
    amplitude: { type: "f", value: 0.0 }
};
var argonTextObject = new THREE.Object3D();
argonTextObject.position.z = -0.5;
userLocation.add(argonTextObject);
var loader = new THREE.FontLoader();
loader.load('../resources/fonts/helvetiker_bold.typeface.json', function (font) {
    var shaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: "\n            uniform float amplitude;\n            attribute vec3 customColor;\n            attribute vec3 displacement;\n            varying vec3 vNormal;\n            varying vec3 vColor;\n            void main() {\n                vNormal = normal;\n                vColor = customColor;\n                vec3 newPosition = position + normal * amplitude * displacement;\n                gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );\n            }\n        ",
        fragmentShader: "\n            varying vec3 vNormal;\n            varying vec3 vColor;\n            void main() {\n                const float ambient = 0.4;\n                vec3 light = vec3( 1.0 );\n                light = normalize( light );\n                float directional = max( dot( vNormal, light ), 0.0 );\n                gl_FragColor = vec4( ( directional + ambient ) * vColor, 1.0 );\n            }\n        "
    });
    var argonTextMesh = createTextMesh(font, "argon.js", shaderMaterial);
    argonTextObject.add(argonTextMesh);
    argonTextObject.scale.set(0.001, 0.001, 0.001);
    argonTextObject.position.z = -0.50;
    // add an argon updateEvent listener to slowly change the text over time.
    // we don't have to pack all our logic into one listener.
    app.context.updateEvent.addEventListener(function () {
        uniforms.amplitude.value = 1.0 + Math.sin(Date.now() * 0.001 * 0.5);
    });
});
function createTextMesh(font, text, material) {
    var textGeometry = new THREE.TextGeometry(text, {
        font: font,
        size: 40,
        height: 5,
        curveSegments: 3,
        bevelThickness: 2,
        bevelSize: 1,
        bevelEnabled: true
    });
    textGeometry.center();
    var tessellateModifier = new THREE.TessellateModifier(8);
    for (var i = 0; i < 6; i++) {
        tessellateModifier.modify(textGeometry);
    }
    var explodeModifier = new THREE.ExplodeModifier();
    explodeModifier.modify(textGeometry);
    var numFaces = textGeometry.faces.length;
    var bufferGeometry = new THREE.BufferGeometry().fromGeometry(textGeometry);
    var colors = new Float32Array(numFaces * 3 * 3);
    var displacement = new Float32Array(numFaces * 3 * 3);
    var color = new THREE.Color();
    for (var f = 0; f < numFaces; f++) {
        var index = 9 * f;
        var h = 0.07 + 0.1 * Math.random();
        var s = 0.5 + 0.5 * Math.random();
        var l = 0.6 + 0.4 * Math.random();
        color.setHSL(h, s, l);
        var d = 5 + 20 * (0.5 - Math.random());
        for (var i = 0; i < 3; i++) {
            colors[index + (3 * i)] = color.r;
            colors[index + (3 * i) + 1] = color.g;
            colors[index + (3 * i) + 2] = color.b;
            displacement[index + (3 * i)] = d;
            displacement[index + (3 * i) + 1] = d;
            displacement[index + (3 * i) + 2] = d;
        }
    }
    bufferGeometry.addAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    bufferGeometry.addAttribute('displacement', new THREE.BufferAttribute(displacement, 3));
    var textMesh = new THREE.Mesh(bufferGeometry, material);
    return textMesh;
}
// set our desired reality 
app.reality.request(Argon.RealityViewer.WEBRTC);
var webrtcRealitySession;
// start listening for connections to a reality
app.reality.connectEvent.addEventListener(function (session) {
    if (session.supportsProtocol('ar.jsartoolkit')) {
        // save a reference to this session
        webrtcRealitySession = session;
        webrtcRealitySession.request('ar.jsartoolkit.init').then(function () {
            webrtcRealitySession.request('ar.jsartoolkit.addMarker', {
                url: "../resources/artoolkit/patt.hiro"
            }).then(function (msg) {
                if (!msg)
                    return;
                // tell argon we want to track a specific marker.  Each marker
                // has a Cesium entity associated with it, and is expressed in a 
                // coordinate frame relative to the camera.  Because they are Cesium
                // entities, we can ask for their pose in any coordinate frame we know
                // about.
                var hiroEntity = app.context.subscribeToEntityById(msg.id);
                // create a THREE object to put on the marker
                var hiroObject = new THREE.Object3D;
                scene.add(hiroObject);
                // the updateEvent is called each time the 3D world should be
                // rendered, before the renderEvent.  The state of your application
                // should be updated here.
                app.context.updateEvent.addEventListener(function () {
                    // get the pose (in local coordinates) of the marker
                    var hiroPose = app.context.getEntityPose(hiroEntity);
                    // if the pose is known the target is visible, so set the
                    // THREE object to the location and orientation
                    if (hiroPose.poseStatus & Argon.PoseStatus.KNOWN) {
                        hiroObject.position.copy(hiroPose.position);
                        hiroObject.quaternion.copy(hiroPose.orientation);
                    }
                    // when the target is first seen after not being seen, the 
                    // status is FOUND.  Here, we move the 3D text object from the
                    // world to the target.
                    // when the target is first lost after being seen, the status 
                    // is LOST.  Here, we move the 3D text object back to the world
                    if (hiroPose.poseStatus & Argon.PoseStatus.FOUND) {
                        console.log("marker found");
                        hiroObject.add(argonTextObject);
                        // note: currently artoolkit markers are always considered 1 meter across
                        // this scale is a temporary fix
                        argonTextObject.scale.set(0.01, 0.01, 0.01);
                        argonTextObject.position.z = 0;
                    }
                    else if (hiroPose.poseStatus & Argon.PoseStatus.LOST) {
                        console.log("marker lost");
                        argonTextObject.scale.set(0.001, 0.001, 0.001);
                        argonTextObject.position.z = -0.50;
                        userLocation.add(argonTextObject);
                    }
                });
            });
        });
    }
});
// the updateEvent is called each time the 3D world should be
// rendered, before the renderEvent.  The state of your application
// should be updated here.
app.context.updateEvent.addEventListener(function () {
    // get the position and orientation (the "pose") of the user
    // in the local coordinate frame.
    var userPose = app.context.getEntityPose(app.context.user);
    // assuming we know the user's pose, set the position of our 
    // THREE user object to match it
    if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
        userLocation.position.copy(userPose.position);
    }
    // udpate our scene matrices
    scene.updateMatrixWorld(false);
});
// renderEvent is fired whenever argon wants the app to update its display
app.renderEvent.addEventListener(function () {
    if (app.reality.isSharedCanvas) {
        // if this is a shared canvas we can't depend on our GL state
        // being exactly how we left it last frame
        renderer.resetGLState();
    }
    else {
        // not a shared canvas, we need to clear it before rendering
        renderer.clear();
    }
    // update the rendering stats
    stats.update();
    // get the subviews for the current frame
    var subviews = app.view.subviews;
    // if we have 1 subView, we're in mono mode.  If more, stereo.
    var monoMode = subviews.length == 1;
    // set the renderer to know the current size of the viewport.
    // This is the full size of the viewport, which would include
    // both subviews if we are in stereo viewing mode
    var view = app.view;
    renderer.setSize(view.renderWidth, view.renderHeight, false);
    renderer.setPixelRatio(app.suggestedPixelRatio);
    var viewport = view.viewport;
    hud.setSize(viewport.width, viewport.height);
    // there is 1 subview in monocular mode, 2 in stereo mode    
    for (var _i = 0, subviews_1 = subviews; _i < subviews_1.length; _i++) {
        var subview = subviews_1[_i];
        // set the position and orientation of the camera for 
        // this subview
        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        // the underlying system provide a full projection matrix
        // for the camera. 
        camera.projectionMatrix.fromArray(subview.frustum.projectionMatrix);
        // set the viewport for this view
        var _a = subview.renderViewport, x = _a.x, y = _a.y, width = _a.width, height = _a.height;
        renderer.setViewport(x, y, width, height);
        // set the webGL rendering parameters and render this view
        renderer.setScissor(x, y, width, height);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);
        // adjust the hud, but only in mono
        if (monoMode) {
            var _b = subview.viewport, x = _b.x, y = _b.y, width = _b.width, height = _b.height;
            hud.setViewport(x, y, width, height, subview.index);
            hud.render(subview.index);
        }
    }
});
