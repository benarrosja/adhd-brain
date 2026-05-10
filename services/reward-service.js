// RewardService is a gamified reward system with motivational quotes for ADHD users
// RPC styles used:
//   - Unary: ClaimReward/ GetReward (one request, one response)
// Server Streaming: StramDailyPlan (one request, many responses)

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const registry = require('../naming/registry');

const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/reward.proto'),
  { keepCase: true, longs: String, defaults: true, oneofs: true }
);
const rewardProto = grpc.loadPackageDefinition(packageDef).reward;

// Track each user's points - key = user ID, value = points total
const userPoints = {};
const AUTH_TOKEN = 'adhd-brain-token';

fuction isAuthenticated(call) {
  const token = call.metadata.get('x-auth-token')[0];
  return token === AUTH_TOKEN;
}

// return a badge based on the user's total points
function getBadge(total){
    if (total >= 500) {
        return 'Diamond Champion';
    } else if (total >= 300) {
        return 'Fire Streak';
    } else if (total >= 100) {
        return 'Rising Star';
    } else if (total >= 50) {
        return 'Getting Started';
    } else {
        return 'Just Beginning';
    }
}
// tell the user how many points until their next badge
function getNextMiliestone(total) {
    if (total < 50) {
        return (50 - total)+ ' more points to the next badge';
    } else if (total < 100) {
        return (100 - total)+ ' more points to the next badge';
    } else if (total < 200) {
        return (200 - total)+ ' more points to the next badge';
    } else if (total < 300) {
        return (300 - total)+ ' more points to the next badge';
    } else if (total < 500) {
        return (500 - total)+ ' more points to the next badge';
    } else {
        return 'You have reached the highest badge, keep going!';
    }
}
// HANDLER 1 - ClaimReward (Unary) - client sends one request, server responds once
function claimReward(call, callback) {
  if (!isAuthenticated(call)) {// 1 Check token for authentication
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Invalid auth token'
    });
  }
    const userId = call.request.user_id;
    const focus_score= call.request.focus_score;
    // validate inputs 
    if (!user_id || user_id.trim() === '') {
        return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'User ID cannot be empty'
        });
    }
    // 3. Calculate points based on focus score (e.g. 20 points for showing up + 80 based on focus score)
    const pointsEarned = 20 + Math.round(focus_score/100 * 80);
    
    // 4 Add to the user's running total 
    if (!userPoints[userId]) {
        userPoints[userId] = 0;// first time user claims 
    }
    userPoints[userId] = userPoints[userId] + pointsEarned;
    const total = userPoints[userId];

    console.log(user_Id+ + 'earned' + pointsEarned + 'points. Total:' + total);

    // send one response back 
    callback(null, {
        points_earned: pointsEarned,
        total_points: total,
        badge: getBadge(total),
        next_milestone: getNextMiliestone(total),
        message: ' Well done. You earned you earned' + pointsEarned + ' points.',
        next_milestone: getNextMiliestone(total)
    });
}
// HANDLER 2 - GetMotivation (Unary) - client sends one mood, server picks a motivational quote
function getMotivation(call, callback) {
    if (!isAuthenticated(call)) {// 1 Check token for authentication
        return callback({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid auth token'
        });
    }
    const user_name = call.request.user_name;
    const mood = call.request.mood;

    // Pick a quote based on the mood
    let quote = '';
    let author = '';

    if (mood === 'anxious') {
        quote = "You do not have to see the whole staircase, just take the first step.";
        author = "Martin Luther King Jr.";
    } else if (mood === 'stuck') {
        quote = "done is better than perfect.";
        author = "Sheryl Sandberg";
    } else if (mood === 'tired') {
        quote = "Rest is not idleness'";
        author = "John Lubbock";
    } else{
        // Default for happy or any other mood 
        quote = "Keep going, your past self would be so proud.";
        author = "Unknown";
    }
    //3. add the user name if provided
    let quoteText= '';
    if (user_name && user_name.trim() !== '') {
        quoteText = user_name + ',remember: "' + quote + '"';
    } else {
        quoteText = '"' + quote + '"';
    }
    //4. Send one response back to the client

    callback(null, {
        quote: quoteText,
        author: author,
        mood_match: mood || 'happy'
    });
}
// HANDLER 3- StreamDailyPlan (Server streaming) - client request a plan, server responds with a stream of items at once
function streamDailyPlan(call) {
    if (!isAuthenticated(call)) {// 1 Check token for authentication
        call.destroy({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid auth token'
        });
        return;
    }
    const user_id= call.request.user_id;
    //2 Validate User Id
    if (!user_id || user_id.trim() === '') {
        call.destroy({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'User ID cannot be empty'
        });
        return;
    }
    //3. Build the day plan - the Pomodoro technique with 25 min focus blocks and 5 min breaks
    const plan = [
        { title: 'Focus Block 1', duration: 25, type: 'work'},
        { title: 'Short Break', duration: 5, type: 'break'},
        { title: 'Focus Block 2', duration: 25, type: 'work'},
        { title: 'Short Break', duration: 5, type: 'break'},
        { title: 'Focus Block 3', duration: 25, type: 'work'},
        { title: 'Long Break', duration: 15, type: 'break'},
        { title: 'Focus Block 4', duration: 25, type: 'work'},
        { title: 'Break', duration: 5, type: 'break'},
        { title: 'Focus Block 5', duration: 25, type: 'work'},
        { title: 'Break', duration: 5, type: 'break'}',
        { title: 'Focus Block 6', duration: 25, type: 'work'},
        { title: 'Break', duration: 5, type: 'break'},
        { title: 'End of Day Reward', duration: 20, type: 'reward'},
    ];

    let index = 0;
    console.log('Streaming daily plan for user:' + user_id);
    // 4 send one plan item every 600ms
    const interval= setInterval(function() {
        if (index >= plan.length) {
            clearInterval(interval);
            call.end();
            console.log('Daily plan stream complete');
            return;
            //send the current item to the client 
            const item = plan[index];
            call.write({
                item_number: index + 1,
                title: item.title,
                duration_minutes: item.duration,
                type: item.type,
                is_last: index === plan.length - 1 // flag to indicate if this is the last item
            });
            console.log('Sent plan item:'+ (index + 1) + ': ' + item.title);
            index= index + 1;
        }, 600);
        // 5 cancelation 
        call.on('cancelled', function() {
            clearInterval(interval);
            console.log('Daily Plan stream cancelled - stopping');
        });
        }
//-- CREATE AND START THRE GRPC SERVER AND REGISTER THIS SERVICE
const server = new grpc.Server();
server.addService(rewardProto.RewardService.service, {
    ClaimReward: claimReward,
    GetMotivation: getMotivation,
    streamDailyPlan: streamDailyPlan
});
const PORT = 50053;
server.bindAsync(
    '0.0.0.0:' + PORT,
    grpc.ServerCredentials.createInsecure(),
    function(error, port) {
        if (error) {
            console.error('Error starting RewardService:' + error.message);
            return;
        }
     
        server.start();
        console.log('gRPC RewardService server running on port' + port);
        // Register Announcement of this service on the local network so the GUI can find it
        registry.publishService('RewardService', 'adhd-reward', PORT, {
            description: 'Gamified reward system with motivational quotes for ADHD users',
            protocol: 'grpc',
            version: '1.0'      
        });
    }
);

process.on('SIGINT', function() {
    console.log('Shutting down RewardService...');
    registry.shutdown();
    server.forceShutdown();
    process.exit(0);
});
