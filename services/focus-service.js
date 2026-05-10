// Focus Service- Focus monitor and ADHA coaching assistant
// RPC styles used: Unary - StartSession - one request in, one response back
// Client streaming - SendFocusHeartbeats - Client sends many heartbeats, server responds once
// Bidirecitional - FocusCoach - Both client and server send messages freely

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const registry = require('../naming/registry');

// Load the Focus proto file - this is the contract for this service
const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/focus.proto'),
  { keepCase: true, longs: String, defaults: true, oneofs: true }
);
const focusProto = grpc.loadPackageDefinition(packageDef).focus;

// In-memory store for active sessions - works like a simple database
// Key = session ID, Value = session details 
const sessionStore = {};

// Every request must include this token in its metadata for authentication
const AUTH_TOKEN = 'adhd-brain-token';

// Check if the incoming call has the correct auth token
function ischeckAuth(call) {
  const token = call.metadata.get('x-auth-token')[0];
  return token === AUTH_TOKEN;
}
// works ou a grade from the focus percentage
function getGrade(percentage) {
  if (percentage >= 80){ 
    return 'A';
} else if (percentage >= 60) {
    return 'B';
} else {  
    return 'C';
    }
}
// Returns an encouraging message based on the focus percentage score
fucntion getEncouragement(percentage) {
  if (percentage >= 80) {
    return 'Excelent job. Keep up the focus!';
    } else if (percentage >= 60) {
    return 'Good work! A little more focus and you can reach your goals!';
    } else {
    return 'Tough session but you showed up, focus can be hard. Take a break and try again!';
    }
}

// Match the user message to a coaching response using keywords checks
function getCoachingReply(Message) {
  // convert to lowercase so the check works regardless if the user types capital letters
  const msg = message.toLowerCase();
    if (msg.includes('stuck') || msg.includes('frozen')) { 
    return 'Try the 2-minutes rule- just 2 minutes, nothing more.';
    }
    if (msg.includes('anxious') || msg.includes('worried')) {
        return' Try 3 slow breaths first. Let the anxiety settle, then begin.';
    }
    if (msg.includes('distracted')) {
        return 'Write down what distracted you, then come back to the task.';
    }
    if (msg.includes('tired')|| msg.includes('exhausted') ) {
        return 'Take a 5-minute break outside can reset everything. Rest is not laziness.Stretch, and get some water. Then try again.';
    }
    if (msg.includes('done') || msg.includes ('finished')) { 
        return 'Celebrate your win. Take a moment to recognize your accomplishment, then move on to the next task.';    
    }
    // Default response if no keywords match
    return 'Tell me more, what is happening for you right now?Keep going, focus can be hard but every moment counts.';
}
// ---- HANDLERS FOR EACH RPC METHOD ----

//Handler 1- StartSession - Unary RPC
// Client sends one request with task details, server creates a session and replies once
function startSession(call, callback) {
  if (!ischeckAuth(call)) { // Step 1: Check authentication token from request metadata
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Invalid auth token'
    });
  } 
  // Step 2: Get the fields from the request message
  const task_title = call.request.task_title;
  const duration_minutes = call.request.duration_minutes;

  // Step 3 - validate the input 
    if (!task_title || task_title.trim()===") {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid task title'
      });
    }
    if (!duration_minutes || duration_minutes <= 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Task title cannot be empty'
      });
    }
    if (!duration_minutes <1 || duration_minutes > 120) {
        return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Duration must be between 1 and 120 minutes'
        });
    }
    // Steop 4 crat a seesion and save it 
    const sessionId = 'sess-'+ Date.now();
    sessionStore[sessionId] = {
        task_title: task_title,
        duration_minutes: duration_minutes,
        started_at: Date.now()
    };
    console.log('Session started: ' + sessionId + '--' + task_title);
// Step 5:Send one response back 
    callback(null, {
        session_id: sessionId,
        message: 'Session started. Focus on:' + task_title,
        success: true    
     });
}
// Handler 2 - SendFocusHeartbeats - Client streaming RPC
// Client sends many heartbeats one at a time using stream.write() when finishes client calls stream.end()triggering 'end'.  
// Server responds once with a summary after all heartbeats are received
function sendFocusHeartbeats(call, callback) {
    if (!ischeckAuth(call)) { // Step 1: Check auth token from request metadata
        return callback({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid auth token'
        });
    } 
    let totalPings = 0; //Step 2: Set up a counter  before any data arrives
    let focusedPings = 0;
    // Step 3: Listen for incoming heartbeats using 'data' event
    call.on('data', (heartbeat) => {
        totalPings= totalPings + 1; // Increment total pings for each heartbeat received
        if (heartbeat.is_focused=== true) {
            focusedPings = focusedPings + 1; // Increment focused pings if this heartbeat indicates focus
        }
        console.log('Heartbeat' +totalPings + 'received.Focused:' + heartbeat.is_focused);
    });
    // Step 4: 'end' event fires Once when the client stops sending
    call.on('end', function(){ 
        // reject if no heartbeats were received
        if (totalPings === 0) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: 'No heartbeats received'
            });
        }
        // Step 5: Calculate focus percentage
        const percentage =(focusedPings / totalPings) * 100;
        console.log('Focus result:' + focusPings + '/' + totalPings + ' = ' + Percentage.toFixed(1) + '%');
        callback(null, { // send the single summary response back to client
            totalPings: totalPings,
            focusedPings: focusedPings,
            focus_percentage: percentage,
            grade: getGrade(percentage),
            encouragement: getEncouragement(percentage)
        });
    });
    // Handler any errors in the stream
    call.on('error', function(err){
        console.error('Heartbeat stream error:' + err.message);
    });
}
// Handler 3 - FocusCoach - Bidirectional streaming RPC. Both client and server can send messages at any time.
// Live Chat where the server sends a greeting first, then both sides write messages until end_chat= true
function focusCoach(call) {
    if (!isAuthenticated(call)) { // Step 1: Check auth token from request metadata
        call.destroy({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid auth token'
        });
        return;
    }
    // Step 2: Send a greeting message to the client as soon as they connect
    call.write({
        message: ' I am your ADHD Focus Coach.How are you feeling now?',
        end_chat: false 
    });
    // Step 3: Listen from messages from the client
    call.on('data', function(userMessage){
        console.log('User said:' + userMessage.message);
        //if client sends end_chat=true, we stop the conversation and end the stream
        if (userMessage.end_chat === true) {
            call.write({
                message: 'Great session today. Remember, every moment of focus counts. You are doing amazing job. See you next time!',
                end_chat: true
            });
            call.end(); // End the server side of the stream
            return;
        }
    // Get reply based on wjay the user said 
    const reply = getCoachingReply(userMessage.message);
    console.log('Coach reply:' + reply);
    // Step 4: Send the coaching reply back to the client
    call.write({
        message: reply,
        end_chat: false
    });
    });
    // step 4 - when the clident closes their side, close the server side as well
    call.on('end', function(){
       call.end();
    });
    // Handle any errors in the stream
    call.on('error', function(err){
        console.error('FocusCoach stream error:' + err.message);
    });
}
// CREATE AND START THE GRPC SERVER---
const server = new grpc.Server();
server.addService(focusProto.FocusService.service, {
    StartSession: startSession,
    SendFocusHeartbeats: sendFocusHeartbeats,
    FocusCoach: focusCoach
});
const PORT = 50052;
server.bindAsync('0.0.0.0:' + PORT, grpc.ServerCredentials.createInsecure(), 
function(err, port){
    if (err) {
        console.error('Could not start FocusService:' + err.message);
        return;
    }
    server.start();
    console.log('FocusService running on port:' + port);
    // Register Announcement of this service on the local network so the GUI can find it
    registry.publishService('FocusService', 'adhd-focus', PORT, {
        description: 'Focus monitor and ADHD coaching assistant',
        protocol: 'grpc',
        version: '1.0'
    });
});
//Clean shutdown when user presses Ctrl+C
process.on('SIGINT', function() {
    console.log('Shutting down FocusService...');
    registry.shutdown();
    server.forceShutdown();
    process.exit(0);
});
