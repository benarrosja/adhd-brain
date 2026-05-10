// TaskService - smart task board for ADHD users
// RPC styles used:
//   - Unary:            AddTask, GetTask( one request, one reply)
//   - Server Streaming: StreamMicroTasks ( one request, many replies)

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const registry = require('../naming/registry');
const { title } = require('process');

// Load the proto file - this is the contract defines waht this service can do
const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/task.proto'),
  { keepCase: true, longs: String, defaults: true, oneofs: true }
);
const taskProto = grpc.loadPackageDefinition(packageDef).task;

// In-memory store - works like a simple database- stores all tasks while the server runs
// Key = task ID, Value = task data details object
const taskStore = {};
// this token must be included in the metadata of each request for authentication. Acts as password
const AUTH_TOKEN = 'adhd-brain-token';

// Check if the request has the correct auth token
function isAuthenticated(call) {
  const token = call.metadata.get('x-auth-token')[0];
  return token === AUTH_TOKEN;
}

// Break a task into smaller micro-tasks
function createMicroSteps(taskId, totalMinutes) {
  const StepsTitles =[
    'set up your workspace and gather everthing you need before you start working, like opening the right documents, getting a pen and paper, etc.',
    'Read thourgh the taks and make sure you understand what you need to do.',
    'Work thourgh the main part of the task',
    'Review your work and fix any mistakes',
    'Final check- tidy up and mark as complete'
  ];
  // each step gets an equal share of the total time
  const minutesPerStep = Math.round(totalMinutes / StepTitles.length);

  //A list of steps using a for loop
  const steps = [];
  
  for (let i = 0; i < StepsTitles.length; i++) {
    const step= {
      micro_id: 'micro-' + taskId + '-' + (i+1), // unique ID for each micro-task
      taskId: taskId, // link back to the main task
      step_title: 'Step ' + (i+1) + ': ' + StepsTitles[i], // descriptive title for the step
      step_number: i+1, // the order of the step
      duration_minutes: minutesPerStep, // how long this step should take
      is_last: i === StepsTitles.length - 1 // ture only on the last step, flag to indicate if this is the last step
    };
    steps.push(step);
  }
  return steps;
}

//---HANDLER 1 - AddTask (Unary) - client sends one request, server responds once
function AddTask(call, callback) {
  if (!isAuthenticated(call)) {
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Invalid auth token'
    });
  }

  //2 get the fieds details from the request
  const tile = call.request.title;
  const description = call.request.description;
  const priority = call.request.priority;
  const duration_minutes = call.request.duration_minutes;

  //3 Validate -reject bad input with an error code 
  if (!title || title.trim() === '') {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Task title cannot be empty'
    });
  }
  if (duration_minutes <= 0 || duration_minutes >= 480) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Duration must be between 1 and 480 minutes'
    });
  }
  //4 Create a unique ID using current timestamp
  const taskId = 'task-' + Date.now();

  // 5 create 5 micro-steps for this task
  const microSteps = createMicroSteps(taskId, duration_minutes);

  //6 Save the task and its micro-steps in the in-memory store
  taskStore[taskId] = {
    title: title,
    description: description,
    priority: priority || 2,
    duration_minutes: duration_minutes,
    microSteps: microSteps
  };
  console.log('Task added: ' + taskId + '--' + title + '"');

  //7 Send a response back to the client
  callback(null, {
    task_id: taskId,
    title: title,
    success: true,
    message: 'Task created successfully with ' + microSteps.length + ' micro-steps.',
  });
}

//---HANDLER 2 - GetTask (Unary) - client sends one request, server responds once
function getTask(call, callback) {
  if (!isAuthenticated(call)) { // 1: Check auth token from request metadata
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Invalid auth token'
    });
  }
  //get the task ID from the request
  const taskid = call.request.task_id;

  //2. validate the task ID
  if(!taskid || taskid.trim() === '') {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid task ID, it cannot be empty'
    });
  }
  //3 Check if the task exists in the store
  if (!taskStore[taskId]) {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: 'Task not found with ID: ' + taskId
    });
  }
  //4. If the task exists, send it back in the response
  const taks= taskStore[task_id];
  console.log('Task retrieved: ' + task_id);
  callback(null, {
    task_id: taskId,
    title: task.title,
    success: true,
    message: 'Task found:' + task.title
  });
}

//---HANDLER 3 - StreamMicroTasks (Server streaming) - client sends one request, server responds with a stream of micro-tasks
// No callback parameter - use call.write() to send each micro-task
function StreamMicroTasks(call) {
  if (!isAuthenticated(call)) { // 1: Check auth token from request metadata
    call.destroy({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Invalid auth token'
    });
    return;
  }
  const taskId = call.request.task_id;

  //2. Check if the task exists
  if (!task_id || !taskStore[taskId]) {
    call.destroy({
      code: grpc.status.NOT_FOUND,
      message: 'Task not found with ID: ' + taskId
    });
    return;
  }
  //3. Get the list of steps to send
  const steps = taskStore[taskId].microSteps;
  let index=0;
  console.log('Streaming '+steps.lenght + 'steps for task: ' + taskId);
  
  //4. Use a timer to send one step every 800ms using setInterval
  const interval = setInterval(function() {
    // all steps sent - stop the interval and close the stream
    if (index >= steps.length) {
      clearInterval(interval);
      call.end();
    console.log( 'Stream complete');
    return;
    }
    // Send the current step to the client
    call.write(steps[index]);
    console.log('Sent step ' + (index+1) + 'of' + steps.length );
    index= index + 1;
  }, 800);
  //5 cancellation handling - if the client cancels/ disconnects from the stream, stop interval sending steps
  call.on('cancelled', function() {
    clearInterval(interval);
    console.log('Client cancelled the stream - stopped interval');
  });
}

// CREATE AND START  gRPC SERVER
const server = new grpc.Server();
//tell  the server which handlers to use for each RPC method defined in the proto file
  server.addService(taskProto.TaskService.service, {
    AddTask: AddTask,
    GetTask: getTask,
    StreamMicroTasks: StreamMicroTasks
  });
  const PORT = 50051;

  server.bindAsync(
'0.0.0.0:' + PORT,
    grpc.ServerCredentials.createInsecure(),
    function (error, port) {
      if (error) {
        console.error('Error stating TaskService:' + error.message);
        return;
      }

      server.start();
      console.log('gRPC taskService server running on port' + port);
      //Anounce register this service on the local network using Bonjour mDNS so the GUI can find it using discoverServices()
      registry.publishService('TaskService', 'adhd-task', PORT, {
        protocol: 'gRPC',
        version: '1.0',
        description: 'Smart task board for ADHD users- Taks management with micro-steps'
      });
    }
  );
  // when user presses Ctrl+C to stop the server,clean up and stop the Bonjour service announcement as well
  process.on('SIGINT', function() {
    console.log('Shutting down TaskService...');
    registry.shutdown();
    server.forceShutdown();
    process.exit(0);  
  });